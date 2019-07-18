import {ExecutorService, ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";
import {Notification, ItemNotification, ResyncNotification, ParcelNotification, ParcelNotificationType, CallbackNotification} from "notification";
import {ItemProcessor} from "itemprocessor";
import {VerboseLevel} from "node_consts";
import {Errors, ErrorRecord} from "errors";

const ItemResult = require('itemresult').ItemResult;
const NodeStats = require('nodestats').NodeStats;
const ItemState = require('itemstate').ItemState;
const ItemCache = require("itemcache").ItemCache;
const NameCache = require("namecache").NameCache;
const ParcelCache = require("parcelcache").ParcelCache;
const Config = require("config").Config;
const ResyncProcessor = require("resyncprocessor").ResyncProcessor;
const ParcelProcessor = require("parcelprocessor").ParcelProcessor;
const ItemInformer = require("iteminformer").ItemInformer;
const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const Lock = require("lock").Lock;
const ex = require("exceptions");
const t = require("tools");

const MAX_SANITATING_RECORDS = 64;

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
        this.parcelCache = new ParcelCache(Config.maxCacheAge);
        // TODO: env cache

        this.verboseLevel = VerboseLevel.NOTHING;
        this.label = "Node(" + myInfo.number + ") ";
        this.isShuttingDown = false;

        this.processors = new t.GenericMap();
        this.parcelProcessors = new t.GenericMap();
        this.resyncProcessors = new t.GenericMap();

        this.keyRequests = new t.GenericMap();
        this.keysUnlimited = new t.GenericMap();
        this.epochMinute = 0;

        this.executorService = new ExecutorService();
        this.lock = new Lock();

        this.config.updateConsensus(this.network.getNodesCount());
        this.network.subscribe(this.myInfo, notification => new ScheduleExecutor(async () => await this.onNotification(notification), 0, this.executorService).run());

        this.callbackService = null;

        this.sanitator = null;
        this.sanitatingIds = new t.GenericSet();

        this.nodeStats = new NodeStats();
        this.statsCollector = null;

        this.pulseStartCleanup();
    }

    async run() {
        this.recordsToSanitate = await this.ledger.findUnfinished();
        this.logger.log(this.label + "records to sanitation: " + this.recordsToSanitate.size);

        if (this.recordsToSanitate.size > 0)
            this.pulseStartSanitation();
        else
            await this.dbSanitationFinished();

        // TODO: callbackService

        return this;
    }

    shutdown() {
        this.isShuttingDown = true;
        // TODO: processors
        this.executorService.shutdown();
        this.cache.shutdown();
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

    async dbSanitationFinished() {
        await this.nodeStats.init(this.ledger, this.config);

        this.pulseCollectStats();
    }

    pulseCollectStats() {
        this.statsCollector = new ExecutorWithFixedPeriod(async () => {
            if (!await this.nodeStats.collect(this.ledger, this.config)) {
                //config changed. stats aren't collected and being reset
                this.statsCollector.cancel();
                this.statsCollector = null;
                this.pulseCollectStats();
            }
        }, this.config.statsIntervalSmall * 1000, this.executorService);
        this.statsCollector.run();
    }

    async provideStats(showDays) {
        if (this.nodeStats.nodeStartTime == null)
            throw new ex.IllegalStateError("node state are not initialized. wait for node initialization to finish.");

        let sizes = Object.values(this.nodeStats.ledgerSize);
        let result = {
            uptime: Math.floor(Date.now() / 1000) - this.nodeStats.nodeStartTime,
            ledgerSize: Number(sizes.length === 0 ? 0 : sizes.reduce((accumulator, value) => accumulator + value)),
            smallIntervalApproved: this.nodeStats.smallIntervalApproved,
            bigIntervalApproved: this.nodeStats.bigIntervalApproved,
            uptimeApproved: this.nodeStats.uptimeApproved,
            coreVersion: VERSION,
            nodeNumber: this.myInfo.number
        };

        if (showDays != null)
            result.payments = await NodeStats.getPaymentStats(this.ledger, showDays);

        return result;
    }

    pulseStartSanitation() {
        this.sanitator = new ExecutorWithDynamicPeriod(async () => await this.startSanitation(), [2000, 500], this.executorService);
        this.sanitator.run();
    }

    async startSanitation() {
        if (this.recordsToSanitate.size === 0) {
            this.sanitator.cancel();
            await this.dbSanitationFinished();
            return;
        }

        this.sanitatingIds.forEach(id => {
            if (!this.recordsToSanitate.has(id))
                this.sanitatingIds.delete(id);
        });

        if (this.sanitatingIds.size < MAX_SANITATING_RECORDS) {
            await this.lock.synchronize("recordsToSanitate", async () => {
                for (let r of this.recordsToSanitate.values())
                    if (r.state !== ItemState.LOCKED && r.state !== ItemState.LOCKED_FOR_CREATION &&
                        r.state !== ItemState.LOCKED_FOR_CREATION_REVOKED && !this.sanitatingIds.has(r.id)) {
                        await this.sanitateRecord(r);
                        this.sanitatingIds.add(r.id);

                        if (this.sanitatingIds.size === MAX_SANITATING_RECORDS)
                            break;
                    }
            });

            if (this.sanitatingIds.size === 0 && this.recordsToSanitate.size > 0) {
                //ONLY LOCKED LEFT
                this.logger.log(this.label + "Locked items left after sanitation: " + this.recordsToSanitate.size);

                //for (let r of this.recordsToSanitate.values())
                //    await r.destroy();

                this.recordsToSanitate.clear();
            }
        }
    }

    /**
     * Asynchronous (non blocking) check/register for item from white list. If the item is new and eligible to process with the
     * consensus, the processing will be started immediately. If it is already processing, the current state will be
     * returned.
     *
     * If item is not signed by keys from white list will return {@link ItemResult#UNDEFINED}.
     *
     * @param {Contract} item - Item to register/check state.
     *
     * @return {ItemResult} current (or last known) item state.
     */
    async registerItem(item) {
        this.report("register item: " + item.id, VerboseLevel.BASE);

        let x = await this.checkItemInternal(item.id, null, item, true, true);

        let ir = (x instanceof ItemResult) ? x : x.getResult();
        this.report("item processor for: " + item.id + " was created, state is " + ir.state.val, VerboseLevel.BASE);
        return ir;
    }

    /**
     * If the item is being electing, block until the item been processed with the consensus. Otherwise
     * returns state immediately.
     *
     * @param {HashId} itemId - Item to check or wait for.
     * @param {number} millisToWait - Time to wait in milliseconds.
     * @return {ItemResult} item state.
     * @throws {EventTimeoutError} for timeout.
     */
    async waitItem(itemId, millisToWait) {
        let x = await this.checkItemInternal(itemId);

        if (x instanceof ItemProcessor) {
            if (!x.isDone())
                await x.doneEvent.await(millisToWait);

            return x.getResult();

        } else if (x instanceof ResyncProcessor)
            return x.getResult();

        return x;
    }

    /**
     * Asynchronous (non blocking) parcel (contract with payment) register.
     * Use Node.waitParcel for waiting parcel being processed.
     * For checking parcel parts use Node.waitItem or Node.checkItem after Node.waitParcel
     * with parcel.getPayloadContract().getId() or parcel.getPaymentContract().getId() as params.
     *
     * @param {Parcel} parcel - Parcel to register/check state.
     * @return {boolean} true if Parcel launch to processing. Otherwise exception will be thrown.
     */
    async registerParcel(parcel) {
        this.report("register parcel: " + parcel.hashId, VerboseLevel.BASE);

        try {
            let x = await this.checkParcelInternal(parcel.hashId, parcel, true);

            if (x instanceof ParcelProcessor) {
                this.report("parcel processor created for parcel: " + parcel.hashId + ", state is " +
                    x.processingState.val, VerboseLevel.BASE);

                return true;
            }

            this.report("parcel processor hasn't created: " + parcel.hashId, VerboseLevel.BASE);

            return false;

        } catch (err) {
            this.report("register parcel: " + parcel.hashId + " failed: " + err.message, VerboseLevel.BASE);

            throw new Error("failed to process parcel: " + err.message);
        }
    }

    /**
     * If the parcel is being processing, block until the parcel been processed (been processed payment and payload contracts).
     *
     * @param {HashId} parcelId - Parcel to wait for.
     * @param {number} millisToWait - Time to wait in milliseconds.
     * @throws {EventTimeoutError} for timeout.
     */
    async waitParcel(parcelId, millisToWait) {
        // first check if item is processing as part of parcel
        let x = await this.checkParcelInternal(parcelId);

        if (x instanceof ParcelProcessor && !x.isDone())
            await x.doneEvent.await(millisToWait);
    }

    report(message, level) {
        if (level <= this.verboseLevel)
            this.logger.log(this.label + message);
    }

    isSanitating() {
        return this.recordsToSanitate.size > 0;      //TODO: activate sanitating
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
            if (!this.isSanitating())
                await this.obtainCommonNotification(notification);
        } else if (notification instanceof CallbackNotification) {
            await this.callbackService.obtainCallbackNotification(notification);
        }
    }

    /**
     * Get environment and follower contract by environment identifier.
     *
     * @param {number} environmentId - Environment subscription.
     * @return {Object} with environment and follower contract.
     *
     */
    async getFullEnvironment(environmentId) {
        let ime = await this.getEnvironment(environmentId);
        ime.nameCache = this.nameCache;
        let contract = ime.getContract();
        contract.nodeInfoProvider = this.nodeInfoProvider;
        let me = ime.getMutable();

        if (me == null)
            return {};

        return {
            "follower": contract,
            "environment": me
        };
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
            await this.lock.synchronize(notification.itemId, async () => {
                // we might still need to download and process it
                if (notification.itemResult.haveCopy)
                    x.addToSources(notification.from);

                if (notification.itemResult.state !== ItemState.PENDING)
                    x.vote(notification.from, notification.itemResult.state);
                else
                    this.logger.log("pending vote on item " + notification.itemId + " from " + notification.from);

                // We answer only if (1) answer is requested and (2) we have position on the subject:
                if (notification.requestResult && x.record.state !== ItemState.PENDING)
                    this.network.deliver(notification.from,
                        new ParcelNotification(this.myInfo, notification.itemId, null, x.getResult(), x.needsVoteFrom(notification.from), notType));
            });
        }
    }

    /**
     * Obtain got common parcel notification: looking for result or parcel processor and register vote.
     *
     * @param {ParcelNotification} notification - Common parcel notification.
     */
    async obtainParcelCommonNotification(notification) {

        // if notification hasn't parcelId we think this is simple item notification and obtain it as it
        if (notification.parcelId == null)
            await this.obtainCommonNotification(notification);
        else {
            // check if item for notification is already processed
            let item_x = await this.checkItemInternal(notification.itemId);
            // if already processed and result has consensus - answer immediately
            if (item_x instanceof ItemResult && item_x.state.isConsensusFound) {
                // we have solution and need not answer, we answer if requested:
                if (notification.requestResult)
                    this.network.deliver(notification.from, new ParcelNotification(this.myInfo, notification.itemId,
                        notification.parcelId, item_x, false, notification.type));

            } else {
                // if we haven't results for item, we looking for or create parcel processor
                let x = await this.checkParcelInternal(notification.parcelId, null, true);

                if (x instanceof ParcelProcessor) {
                    let resultVote = notification.itemResult;

                    await this.lock.synchronize(x.parcelId, async () => {
                        // we might still need to download and process it
                        if (resultVote.haveCopy)
                            x.addToSources(notification.from);

                        if (resultVote.state !== ItemState.PENDING)
                            x.vote(notification.from, resultVote.state, notification.type.isU);
                        else
                            this.logger.log("pending vote on parcel " + notification.parcelId + " and item " +
                                notification.itemId + " from " + notification.from);

                        // We answer only if (1) answer is requested and (2) we have position on the subject:
                        if (notification.requestResult) {
                            // if notification type is payment, we use payment data from parcel, otherwise we use payload data
                            if (notification.type.isU) {
                                // parcel for payment
                                if (x.getPaymentState() !== ItemState.PENDING)
                                    this.network.deliver(notification.from,
                                        new ParcelNotification(this.myInfo, notification.itemId, notification.parcelId,
                                            x.getPaymentResult(), x.needsPaymentVoteFrom(notification.from), notification.type)
                                    );

                            } else {
                                // parcel for payload
                                if (x.getPayloadState() !== ItemState.PENDING)
                                    this.network.deliver(notification.from,
                                        new ParcelNotification(this.myInfo, notification.itemId, notification.parcelId,
                                            x.getPayloadResult(), x.needsPayloadVoteFrom(notification.from), notification.type)
                                    );
                            }
                        }
                    });
                }
            }
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
     * Check the parcel's processing state. If parcel is not under processing (not start or already finished)
     * return ParcelProcessingState.NOT_EXIST.
     *
     * @param {HashId} parcelId - Parcel to check.
     * @return {ParcelProcessingState} processing state.
     */
    async checkParcelProcessingState(parcelId) {
        this.report("check parcel processor state for parcel: " + parcelId, VerboseLevel.BASE);

        let x = await this.checkParcelInternal(parcelId);

        if (x instanceof ParcelProcessor) {
            this.report("parcel processor for parcel: " + parcelId + " state is " + x.processingState.val,
            VerboseLevel.BASE);

            return x.processingState;
        }

        this.report("parcel processor for parcel: " + parcelId + " was not found",
            VerboseLevel.BASE);

        return ParcelProcessingState.NOT_EXIST;
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
     * @param {ParcelProcessor} parcelProcessor - Parent parcel processor for synchronize payment and payload. Default is null.
     * @param {boolean} isPayment - True if item is payment. Default is false.
     *
     * @return {ItemResult| ItemProcessor | ResyncProcessor} instance of ItemProcessor if the item is being processed (also if it was started by the call),
     *         ItemResult if it is already processed or can't be processed, say, created_at field is too far in
     *         the past, in which case result state will be ItemState#DISCARDED.
     */
    async checkItemInternal(itemId, parcelId = null, item = null, autoStart = false, forceChecking = false, ommitItemResult = false, parcelProcessor = null, isPayment = false) {
        try {
            this.report("checkItemInternal: " + itemId, VerboseLevel.BASE);

            return await this.lock.synchronize(itemId, async () => {

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
                    let processor = await new ItemProcessor(itemId, parcelId, item, forceChecking, this, parcelProcessor, isPayment).run();
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
            });
        } catch (err) {
            throw new Error("failed to checkItem" + err.message);
        }
    }

    /**
     * Optimized for various usages, check the parcel, start processing as need, return object depending on the current
     * state. Note that actual error codes are set to the item itself. Use in pair with checkItemInternal() to check parts of parcel.
     *
     * @param {HashId} parcelId - Parcel's id.
     * @param {Parcel} parcel - Provide parcel if need, can be null. Default is null.
     * @param {boolean} autoStart - create new ParcelProcessor if not exist. Default is false.
     * @return {ItemResult | ParcelProcessor} instance of ParcelProcessor if the parcel is being processed
     *         (also if it was started by the call), ItemResult if it is can't be processed.
     */
    async checkParcelInternal(parcelId, parcel = null, autoStart = false) {
        try {
            this.report("checkParcelInternal: " + parcelId, VerboseLevel.BASE);

            return await this.lock.synchronize(parcelId, async () => {
                // let's look existing parcel processor
                let processor = this.parcelProcessors.get(parcelId);
                if (processor != null)
                    return processor;

                // if nothing found and need to create new - create it
                if (autoStart) {
                    if (parcel != null)
                        this.parcelCache.put(parcel);

                    processor = await new ParcelProcessor(parcelId, parcel, this).run();
                    this.parcelProcessors.set(parcelId, processor);

                    return processor;
                } else
                    return ItemResult.UNDEFINED;
            });
        } catch (err) {
            console.log(err.stack);
            throw new Error("failed to checkParcel: " + err.message);
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
            this.logger.log(err.stack);
            this.logger.log("sanitateRecord error: " + err.message);
        }
    }

    itemSanitationTimeout(record) {
        if (this.recordsToSanitate.has(record.id)) {
            this.report("itemSanitationTimeout " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);

            new ScheduleExecutor(async () => await this.sanitateRecord(record), 5000, this.executorService).run();
        }
    }

    async removeLocks(record) {
        let idsToRemove = new t.GenericSet();
        for (let r of this.recordsToSanitate.values()) {
            if (r.lockedByRecordId === record.recordId) {
                await this.lock.synchronize(r.id, async () => {
                    try {
                        if (record.state === ItemState.APPROVED) {
                            //ITEM APPROVED. LOCKED -> REVOKED, LOCKED_FOR_CREATION -> APPROVED
                            if (r.state === ItemState.LOCKED) {
                                await r.revoke(undefined, true);
                                idsToRemove.add(r.id);
                            } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                                await r.approve(undefined, undefined, true);
                                idsToRemove.add(r.id);
                            }
                        } else if (record.state === ItemState.DECLINED) {
                            //ITEM REJECTED. LOCKED -> APPROVED, LOCKED_FOR_CREATION -> REMOVE
                            if (r.state === ItemState.LOCKED) {
                                await r.approve(undefined, undefined, true);
                                idsToRemove.add(r.id);
                            } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                                await r.destroy();
                                idsToRemove.add(r.id);
                            }
                        } else if (record.state === ItemState.REVOKED) {
                            //ITEM APPROVED AND THEN REVOKED. LOCKED -> REVOKED, LOCKED_FOR_CREATION -> APPROVED
                            if (r.state === ItemState.LOCKED) {
                                await r.revoke(undefined, true);
                                idsToRemove.add(r.id);
                            } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                                await r.approve(undefined, undefined, true);
                                idsToRemove.add(r.id);
                            }
                        } else if (record.state === ItemState.UNDEFINED) {
                            //ITEM UNDEFINED. LOCKED -> APPROVED, LOCKED_FOR_CREATION -> REMOVE
                            if (r.state === ItemState.LOCKED) {
                                await r.approve(undefined, undefined, true);
                                idsToRemove.add(r.id);
                            } else if (r.state === ItemState.LOCKED_FOR_CREATION) {
                                await r.destroy();
                                idsToRemove.add(r.id);
                            }
                        }

                    } catch (err) {
                        this.logger.log(err.stack);
                        this.logger.log("removeLocks error: " + err.message);
                    }
                });
            }
        }

        idsToRemove.forEach(id => this.recordsToSanitate.delete(id));
    }

    async itemSanitationDone(record) {
        await this.lock.synchronize("recordsToSanitate", async () => {
            if (this.recordsToSanitate.has(record.id)) {
                this.recordsToSanitate.delete(record.id);
                await this.removeLocks(record);
                this.report("itemSanitationDone " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);
            }
        });
    }

    async itemSanitationFailed(record) {
        await this.lock.synchronize("recordsToSanitate", async () => {
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
        });
    }

    checkSpecialItem(item) {
        if (!item instanceof Contract)
            return;

        //this.checkForNetConfig(item); TODO: Deprecated. outdated method. will be replaced with new one soon
        this.checkForSetUnlimit(item);
    }

    checkForSetUnlimit(contract) {
        // check unlimit contract
        if (!contract.isUnlimitKeyContract(this.config))
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