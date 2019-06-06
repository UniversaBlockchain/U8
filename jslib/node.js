import {ExecutorService, ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";
import {Notification, ItemNotification, ResyncNotification, ParcelNotification} from "notification";
import {ItemProcessor, ItemProcessingState} from "itemprocessor"
import {VerboseLevel} from "node_consts";
import {Errors, ErrorRecord} from "errors"

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const ItemCache = require("itemcache").ItemCache;
const Config = require("config").Config;
const ResyncProcessor = require("resyncprocessor").ResyncProcessor;
const ItemInformer = require("iteminformer").ItemInformer;

class Node {

    constructor(config, myInfo, ledger, network, nodeKey, logger) {
        this.config = config;
        this.myInfo = myInfo;
        this.ledger = ledger;
        this.network = network;
        this.logger = logger;
        this.informer = new ItemInformer();

        this.cache = new ItemCache(Config.maxCacheAge);
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
        this.executorService = new ExecutorService();

        this.config.updateConsensus(this.network.getNodesCount());
        //this.network.subscribe(this.myInfo, notification => new ScheduleExecutor(() => this.onNotification(notification), 0, this.executorService).run());

        // TODO: callbackService
        // TODO: pulseCleanUp
    }

    async run() {
        this.recordsToSanitate = await this.ledger.findUnfinished();
        this.logger.log(this.label + "records to sanitation: " + this.recordsToSanitate.size);

        // TODO: sanitation

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

            let hasEnvironment = itemState === ItemState.APPROVED && await this.getEnvironment(notification.itemId) != null;
            try {
                this.network.deliver(notification.from, new ResyncNotification(this.myInfo, notification.itemId,
                    itemState, hasEnvironment, false));
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
     * @return {ItemProcessor} instance of ItemProcessor if the item is being processed (also if it was started by the call),
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
                let r = this.ledger.getRecord(itemId);
                // if it is not pending, it means it is already processed:
                if (r != null && !r.state.isPending) {
                    // it is, and we may still have it cached - we do not put it again:
                    this.report("checkItemInternal: " + itemId + "found item result, and state is: " +
                        r.state.val, VerboseLevel.BASE);

                    let cachedItem = this.cache.get(itemId);
                    let result = this.cache.getResult(itemId);
                    if (result == null)
                        result = new ItemResult(r, cachedItem != null);

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
     * Resync the item.
     * This method launch resync process, call to network to know what consensus is or hasn't consensus for the item.
     *
     * @param {HashId} id - Item to resync.
     * @param {function} onComplete - callback for resync finish. Optional.
     */
    resync(id, onComplete = undefined) {
        let resyncProcessor = this.resyncProcessors.get(id);
        if (resyncProcessor == null)
            this.resyncProcessors.set(id, new ResyncProcessor(id, this, onComplete).startResync());
        else
            resyncProcessor.restartResync();
    }

    async getEnvironment(id) {
        //let result = this.envCache.get(id);
        //if (result == null) {
        let result = await this.ledger.getEnvironment(id);
        //    if (result != null)
        //        envCache.put(result);
        //}
        return result;
    }

    removeEnvironment(id) {
        //this.envCache.remove(id);
        return this.ledger.removeEnvironment(id);
    }

    sanitateRecord(r) {
        try {
            if (this.isShuttingDown)
                return;
            this.resync(r.id);
        } catch (err) {
            this.logger.log(err.message);
            this.logger.log(err.stack);
        }
    }

    itemSanitationTimeout(record) {
        if (this.recordsToSanitate.has(record.id)) {
            this.report("itemSanitationTimeout " + record.id + " " + this.recordsToSanitate.size, VerboseLevel.BASE);

            new ScheduleExecutor(() => this.sanitateRecord(record), 5000, this.executorService).run();
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
}

module.exports = {Node};