import {ExecutorService, ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod} from "executorservice";
import {Notification, ItemNotification, ResyncNotification} from "notification";
import {ItemProcessor, ItemProcessingState} from "itemprocessor"
import {VerboseLevel} from "node_consts";

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const ItemCache = require("itemcache").ItemCache;
const Config = require("config").Config;
const ResyncProcessor = require("resyncprocessor").ResyncProcessor;

class Node {

    constructor(config, myInfo, ledger, network, nodeKey, logger) {
        this.config = config;
        this.myInfo = myInfo;
        this.ledger = ledger;
        this.network = network;
        this.logger = logger;

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

        //this.config.updateConsensus(this.network.getNodesCount());
        //this.network.subscribe(this.myInfo, notification => new ScheduleExecutor(() => this.onNotification(notification), 0, this.executorService).run());

        // TODO: callbackService
        // TODO: pulseCleanUp
    }

    async run() {
        this.recordsToSanitate = await this.ledger.findUnfinished();
        this.logger.log(this.label + this.recordsToSanitate.size);

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
            let itemObject = this.checkItemInternal(notification.itemId);
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
                this.network.deliver(notification.from, new ResyncNotification(this.myInfo, notification.itemId, itemState, hasEnvironment, false));
            } catch (err) {
                this.report("error: unable to send ResyncNotification answer, exception: " + err.message, VerboseLevel.BASE);
            }
        } else {
            let resyncProcessor = this.resyncProcessors.get(notification.itemId);
            if (resyncProcessor != null)
                resyncProcessor.obtainAnswer(notification);
        }
    }

    //TODO: checkItemInternal

    /**
     * Resync the item.
     * This method launch resync process, call to network to know what consensus is or hasn't consensus for the item.
     *
     * @param {HashId} id - Item to resync.
     * @param {function} onComplete - callback for resync finish. Optional.
     */
    resync(id, onComplete) {
        let resyncProcessor = this.resyncProcessors.get(id);
        if (resyncProcessor == null)
            this.resyncProcessors.set(id, new ResyncProcessor(id, onComplete).startResync());
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


}

module.exports = {Node};