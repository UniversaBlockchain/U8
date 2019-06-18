import {ExecutorService, ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";
import {Notification, ItemNotification, ResyncNotification, ParcelNotification, ParcelNotificationType} from "notification";
import {ItemProcessor} from "itemprocessor";
import {VerboseLevel} from "node_consts";
import {Errors, ErrorRecord} from "errors";

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const ItemCache = require("itemcache").ItemCache;
const NameCache = require("namecache").NameCache;
const Config = require("config").Config;
const ResyncProcessor = require("resyncprocessor").ResyncProcessor;
const ItemInformer = require("iteminformer").ItemInformer;
const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const t = require("tools");

class Node {

    constructor(config, myInfo, ledger, network, nodeKey, logger) {
        this.config = config;
        this.myInfo = myInfo;
        this.ledger = ledger;
        this.network = network;
        this.logger = logger;
        this.informer = new ItemInformer();
        this.nodeInfoProvider = new BaseNodeInfoProvider(this.config);

        this.cache = new ItemCache(Config.maxCacheAge);
        this.nameCache = new NameCache(Config.maxNameCacheAge);
        // TODO: other caches

        this.verboseLevel = VerboseLevel.NOTHING;
        this.label = "Node(" + myInfo.number + ") ";
        this.isShuttingDown = false;
        this.sanitationFinished = new Promise(resolve => this.sanitationFinishedFire = resolve);

        this.processors = new t.GenericMap();
        this.parcelProcessors = new t.GenericMap();
        this.resyncProcessors = new t.GenericMap();

        this.keyRequests = new t.GenericMap();
        this.keysUnlimited = new t.GenericMap();
        this.epochMinute = 0;

        this.executorService = new ExecutorService();

        this.config.updateConsensus(this.network.getNodesCount());
        this.network.subscribe(this.myInfo, notification => new ScheduleExecutor(async () => await this.onNotification(notification), 0, this.executorService).run());

        this.callbackService = null;

        this.pulseStartCleanup();
    }

    pulseStartCleanup() {
        new ExecutorWithDynamicPeriod(async () => {
            if (this.ledger != null)
                await this.ledger.cleanup(this.config.permanetMode)
        }, [1000, Config.maxDiskCacheAge * 1000], this.executorService).run();

        new ExecutorWithFixedPeriod(async () => {
            if (this.ledger != null)
                await this.ledger.removeExpiredStoragesAndSubscriptionsCascade()
        }, Config.expriedStorageCleanupInterval * 1000, this.executorService).run();

        new ExecutorWithFixedPeriod(async () => {
            if (this.ledger != null)
                await this.ledger.clearExpiredNameRecords(this.config.holdDuration);
        }, Config.expriedNamesCleanupInterval * 1000, this.executorService).run();
    }

    async run() {
        this.recordsToSanitate = await this.ledger.findUnfinished();
        this.logger.log(this.label + "records to sanitation: " + this.recordsToSanitate.size);

        // TODO: sanitation
        // TODO: callbackService

        return this;
    }

    shutdown() {
        this.isShuttingDown = true;
        // TODO: processors
        this.executorService.shutdown();
        this.cache.shutdown();
    }

    report(message, level) {
        if (level <= this.verboseLevel)
            this.logger.log(this.label + message);
    }

    isSanitating() {
        return this.recordsToSanitate.size > 0;
    }

    /**
     * Notification handler. Checking type of notification and call needed handler.
     *
     * @param {Notification} notification.
     */
    async onNotification(notification) {
        if (notification instanceof ParcelNotification) {
            if(!this.isSanitating())
                await this.obtainParcelCommonNotification(notification);
        } else if (notification instanceof ResyncNotification) {
            await this.obtainResyncNotification(notification);
        } else if (notification instanceof ItemNotification) {
            if(!this.isSanitating())
                await this.obtainCommonNotification(notification);
        //} else if (notification instanceof CallbackNotification) {
        //    await this.callbackService.obtainCallbackNotification(notification);
        }
    }

    /**
     * Obtain got common item notification: looking for result or item processor and register vote.
     *
     * @param {ItemNotification} notification - Common item notification.
     *
     */
    async obtainCommonNotification(notification) {
        // get processor, create if need
        // register my vote
        let x = await this.checkItemInternal(notification.itemId, null, null, true, true);

        // If it is not ParcelNotification we think t is payment type of notification
        let notType;
        if (notification instanceof ParcelNotification)
            notType = notification.type;
        else
            notType = ParcelNotificationType.PAYMENT;

        if (x instanceof ItemResult) {
            // we have solution and need not answer, we answer if requested:
            if (notification.requestResult)
                this.network.deliver(notification.from,
                    new ParcelNotification(this.myInfo, notification.itemId, null, x, false, notType));

        } else if (x instanceof ItemProcessor) {
            // we might still need to download and process it
            if (notification.itemResult.haveCopy)
                x.addToSources(notification.from);

            if (notification.itemResult.state !== ItemState.PENDING)
                await x.vote(notification.from, notification.itemResult.state);
            else
                this.logger.log("pending vote on item " + notification.itemId + " from " + notification.from);

            // We answer only if (1) answer is requested and (2) we have position on the subject:
            if (notification.requestResult && x.record.state !== ItemState.PENDING)
                this.network.deliver(notification.from,
                    new ParcelNotification(this.myInfo, notification.itemId, null, x.getResult(), x.needsVoteFrom(notification.from), notType));
        }
    }

    /**
     * Obtained resync notification: looking for requested item and answer with it's status.
     * Accept answer if it is.
     *
     * @param {ResyncNotification} notification - Resync notification.
     */
    async obtainResyncNotification(notification) {
        if (notification.requestResult) {
            let itemObject = await this.checkItemInternal(notification.itemId);
            let itemResult = null;
            let itemState = ItemState.UNDEFINED;

            if (itemObject instanceof ItemResult)
                // we have solution for resyncing subitem:
                itemResult = itemObject;
            else if (itemObject instanceof ItemProcessor)
                // resyncing subitem is still processing, but may be has solution:
                itemResult = itemObject.getResult();

            if (itemResult != null && itemResult.state.isConsensusFound)
                itemState = itemResult.state;

            let hasEnvironment = itemState === ItemState.APPROVED &&
                await this.getEnvironmentByContractID(notification.itemId) != null;

            try {
                this.network.deliver(notification.from,
                    new ResyncNotification(this.myInfo, notification.itemId, false, itemState, hasEnvironment));
            } catch (err) {
                this.report("error: unable to send ResyncNotification answer, exception: " + err.message,
                    VerboseLevel.BASE);
            }
        } else {
            let resyncProcessor = this.resyncProcessors.get(notification.itemId);
            if (resyncProcessor != null)
                resyncProcessor.obtainAnswer(notification);
        }
    }

    /**
     * Check the state of the item. This method does not start elections and can be safely called from a client.
     *
     * @param {HashId} itemId - ID of item to check.
     *
     * @return {ItemResult} last known state.
     */
    async checkItem(itemId) {
        this.report("check item processor state for item: " + itemId.toString(), VerboseLevel.BASE);

        let x = await this.checkItemInternal(itemId);

        let ir = ItemResult.UNDEFINED;
        if (x instanceof ItemResult)
            ir = x;
        else if (x instanceof ItemProcessor || x instanceof ResyncProcessor)
            ir = x.getResult();

        this.report("item state for: " + itemId.toString() + " is " + ir.state.val, VerboseLevel.BASE);

        ir = ir.copy();

        let record = this.informer.takeFor(itemId);
        if (record != null)
            ir.errors = record.errorRecords;

        ir.isTestnet = await this.ledger.isTestnet(itemId);

        return ir;
    }

    /**
     * Optimized for various usages, check the item, start processing as need, return object depending on the current
     * state. Note that actual error codes are set to the item itself.
     *
     * @param {HashId} itemId - Item ID to check the state.
     * @param {HashId} parcelId - Parcel ID to check the state. Default is null.
     * @param {Contract} item - Provide item if any, can be null. Default is null.
     * @param {boolean} autoStart - Create new ItemProcessor if not exist. Default is false.
     * @param {boolean} forceChecking - Point item processor to wait (if false) with item checking or start without waiting (if true).
     *                      Default is false. Use ItemProcessor.forceChecking() to start waiting item checking.
     * @param {boolean} ommitItemResult - Do not return ItemResult for processed item,
     *                        create new ItemProcessor instead (if autoStart is true). Default is false.
     *
     * @return {ItemResult| ItemProcessor | ResyncProcessor} instance of ItemProcessor if the item is being processed (also if it was started by the call),
     *         ItemResult if it is already processed or can't be processed, say, created_at field is too far in
     *         the past, in which case result state will be ItemState#DISCARDED.
     */
    async checkItemInternal(itemId, parcelId = null, item = null, autoStart = false, forceChecking = false, ommitItemResult = false) {
        try {
            this.report("checkItemInternal: " + itemId, VerboseLevel.BASE);

            let ip = this.processors.get(itemId);
            if (ip != null) {
                this.report("checkItemInternal: " + itemId + "found item processor in state: " +
                    ip.processingState.val, VerboseLevel.BASE);
                return ip;
            }

            // if we want to get already processed result for item
            if (!ommitItemResult) {
                let r = await this.ledger.getRecord(itemId);
                // if it is not pending, it means it is already processed:
                if (r != null && !r.state.isPending) {
                    // it is, and we may still have it cached - we do not put it again:
                    this.report("checkItemInternal: " + itemId + "found item result, and state is: " +
                        r.state.val, VerboseLevel.BASE);

                    let cachedItem = this.cache.get(itemId);
                    let result = this.cache.getResult(itemId);
                    if (result == null)
                        result = ItemResult.fromStateRecord(r, cachedItem != null);

                    return result;
                }

                // we have no consensus on it. We might need to find one, after some precheck.
                // The contract should not be too old to process:
                if (item != null && item.getCreatedAt().getTime() < Date.now() - Config.maxItemCreationAge * 1000) {
                    // it is too old - client must manually check other nodes. For us it's unknown
                    item.errors.push(new ErrorRecord(Errors.EXPIRED, "created_at", "too old"));
                    this.informer.inform(item);

                    this.report("checkItemInternal: " + itemId + "too old: ", VerboseLevel.BASE);
                    return ItemResult.DISCARDED;
                }
            }

            // if we want to create new ItemProcessor
            if (autoStart) {
                if (item != null)
                    this.cache.put(item, ItemResult.UNDEFINED);

                this.report("checkItemInternal: " + itemId + "nothing found, will create item processor",
                    VerboseLevel.BASE);
                let processor = new ItemProcessor(itemId, parcelId, item, forceChecking, this);
                this.processors.set(itemId, processor);
                return processor;

            } else {
                let rp = this.resyncProcessors.get(itemId);
                if (rp == null)
                    return ItemResult.UNDEFINED;

                this.report("checkItemInternal: " + itemId + "found resync processor in state: " +
                    rp.resyncingItem.resyncingState.val, VerboseLevel.BASE);
                return rp;
            }
        } catch (err) {
            throw new Error("failed to checkItem" + err.message);
        }
    }

    /**
     * Checks limit of requests for key.
     *
     * @param {crypto.PublicKey} key - Key for checking limit of requests.
     * @return {boolean} result of checking.
     */
    checkKeyLimit(key) {
        if (this.config == null ||
            Config.networkAdminKeyAddress.match(key) ||
            this.myInfo.publicKey.equals(key) ||
            this.config.keysWhiteList.some(k => k.equals(key)) ||
            this.config.addressesWhiteList.some(addr => addr.match(key)))
            return true;

        let currentEpochMinute = Math.floor(Date.now() / 60000);
        if (this.epochMinute !== currentEpochMinute) {
            this.keyRequests.clear();
            this.epochMinute = currentEpochMinute;
        }

        let expiredUnlimit = this.keysUnlimited.get(key);
        if (expiredUnlimit != null) {
            if (expiredUnlimit < Date.now())
                this.keysUnlimited.delete(key);
            else
                return true;
        }

        let requests = this.keyRequests.get(key);
        if (requests == null)
            requests = 0;
        if (requests >= Config.limitRequestsForKeyPerMinute)
            return false;

        this.keyRequests.set(key, requests + 1);

        return true;
    }

    /**
     * Resync the item.
     * This method launch resync process, call to network to know what consensus is or hasn't consensus for the item.
     *
     * @param {HashId} id - Item to resync.
     * @param {function} onComplete - callback for resync finish. Optional.
     */
    async resync(id, onComplete = undefined) {
        let resyncProcessor = this.resyncProcessors.get(id);
        if (resyncProcessor == null)
            this.resyncProcessors.set(id, await new ResyncProcessor(id, this, onComplete).startResync());
        else
            resyncProcessor.restartResync();
    }

    async getEnvironmentByContractID(id) {
        //let result = this.envCache.get(id);
        //if (result == null) {
        //    result = await this.ledger.getEnvironmentByContractID(id);
        //    if (result != null)
        //        envCache.put(result);
        //}
        //return result;
        return await this.ledger.getEnvironmentByContractID(id);
    }

    async getEnvironmentByContract(item, connection = undefined) {
        //let result = this.envCache.get(item.id);
        //if (result == null && item.state.parent != null)
        //    result = this.envCache.get(item.state.parent);

        //if (result == null) {
        //    result = await this.ledger.getEnvironment(item);
        //    this.envCache.put(result);
        //}
        //return result;
        return await this.ledger.getEnvironmentByContract(item, connection);
    }

    async getEnvironment(environmentId, connection = undefined) {
        //let result = this.envCache.get(environmentId);
        //if (result == null) {
        //    result = await this.ledger.getEnvironment(environmentId);
        //    if (result != null)
        //        this.envCache.put(result);
        //}
        //return result;
        return await this.ledger.getEnvironment(environmentId, connection);
    }

    removeEnvironment(id, con) {
        //this.envCache.remove(id);
        return this.ledger.removeEnvironment(id, con);
    }

    async sanitateRecord(r) {
        try {
            if (this.isShuttingDown)
                return;
            await this.resync(r.id);
        } catch (err) {
            this.logger.log(err.message);
            this.logger.log(err.stack);
        }
    }

    itemSanitationTimeout(record) {
        if (this.recordsToSanitate.has(record.id)) {
            this.report("itemSanitationTimeout " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);

            new ScheduleExecutor(async () => await this.sanitateRecord(record), 5000, this.executorService).run();
        }
    }

    async removeLocks(record) {
        let idsToRemove = new Set();
        for (let r of this.recordsToSanitate.values()) {
            if (r.lockedByRecordId === record.recordId) {
                try {
                    if (record.state === ItemState.APPROVED) {
                        //ITEM APPROVED. LOCKED -> REVOKED, LOCKED_FOR_CREATION -> APPROVED
                        if (r.state === ItemState.LOCKED) {
                            await r.revoke();
                            idsToRemove.add(r.id);
                        } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                            await r.approve();
                            idsToRemove.add(r.id);
                        }
                    } else if (record.state === ItemState.DECLINED) {
                        //ITEM REJECTED. LOCKED -> APPROVED, LOCKED_FOR_CREATION -> REMOVE
                        if (r.state === ItemState.LOCKED) {
                            await r.approve();
                            idsToRemove.add(r.id);
                        } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                            await r.destroy();
                            idsToRemove.add(r.id);
                        }
                    } else if (record.state === ItemState.REVOKED) {
                        //ITEM APPROVED AND THEN REVOKED. LOCKED -> REVOKED, LOCKED_FOR_CREATION -> APPROVED
                        if (r.state === ItemState.LOCKED) {
                            await r.revoke();
                            idsToRemove.add(r.id);
                        } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                            await r.approve();
                            idsToRemove.add(r.id);
                        }
                    } else if (record.state === ItemState.UNDEFINED) {
                        //ITEM UNDEFINED. LOCKED -> APPROVED, LOCKED_FOR_CREATION -> REMOVE
                        if (r.state === ItemState.LOCKED) {
                            await r.approve();
                            idsToRemove.add(r.id);
                        } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                            await r.destroy();
                            idsToRemove.add(r.id);
                        }
                    }
                    return null;

                } catch (err) {
                    this.logger.log(err.message);
                    this.logger.log(err.stack);
                }
            }
        }

        idsToRemove.forEach(id => this.recordsToSanitate.delete(id));
    }

    async itemSanitationDone(record) {
        if (this.recordsToSanitate.has(record.id)) {
            this.recordsToSanitate.delete(record.id);
            await this.removeLocks(record);
            this.report("itemSanitationDone " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);
        }
    }

    async itemSanitationFailed(record) {
        if (this.recordsToSanitate.has(record.id)) {
            this.recordsToSanitate.delete(record.id);

            record.state = ItemState.UNDEFINED;
            await this.removeLocks(record);

            //item unknown to network we must restart voting
            let contract = await this.ledger.getItem(record);

            await record.destroy();

            this.report("itemSanitationFailed " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);

            if (contract != null) {
                this.report("restart vote after sanitation fail: " + record.id, VerboseLevel.BASE);

                //Item found in disk cache. Restart voting.
                this.checkItemInternal(contract.id, null, contract, true, true, false);
            }
        }
    }

    checkSpecialItem(item) {
        if (!item instanceof Contract)
            return;

        //this.checkForNetConfig(item); TODO: Deprecated. outdated method. will be replaced with new one soon
        this.checkForSetUnlimit(item);
    }

    checkForSetUnlimit(contract) {
        // check unlimit contract
        if (!contract.isUnlimitKeyContract(config))
            return;

        // get key for setting unlimited requests
        let key = null;
        try {
            let packedKey = contract.transactional.data.unlimited_key;
            if (packedKey == null)
                return;

            key = new crypto.PublicKey(packedKey);

        } catch (err) {
            return;
        }

        // setting unlimited requests for a key
        this.keyRequests.delete(key);
        this.keysUnlimited.delete(key);
        this.keysUnlimited.set(key, Date.now() + Config.unlimitPeriod * 1000);
    }
}

class BaseNodeInfoProvider extends NodeInfoProvider {

    constructor(config) {
        super();
        this.config = config;
    }

    getUIssuerKeys() {
        return this.config.uIssuerKeys;
    }

    getUIssuerName() {
        return Config.uIssuerName;
    }

    getMinPayment(extendedType) {
        return Config.minPayment[extendedType];
    }

    getServiceRate(extendedType) {
        return Config.rate[extendedType];
    }

    getAdditionalKeysToSignWith(extendedType) {
        if (extendedType === NSmartContract.SmartContractType.UNS1)
            return [Config.authorizedNameServiceCenterKey];

        return [];
    }
}

module.exports = {Node};