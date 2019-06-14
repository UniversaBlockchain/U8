import {ScheduleExecutor, ExecutorWithDynamicPeriod, EventTimeoutError, AsyncEvent} from "executorservice";
import {VerboseLevel} from "node_consts";
import {ParcelNotification, ParcelNotificationType} from "notification";

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const Config = require("config").Config;
const Contract = require("contract").Contract;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const t = require("tools");

const ItemProcessingState = {
    NOT_EXIST : {val: "NOT_EXIST", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 0},
    INIT : {val: "INIT", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 1},
    DOWNLOADING : {val: "DOWNLOADING", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 2},
    DOWNLOADED : {val: "DOWNLOADED", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 3},
    CHECKING : {val: "CHECKING", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 4},
    RESYNCING : {val: "RESYNCING", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 5},
    GOT_RESYNCED_STATE : {val: "GOT_RESYNCED_STATE", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 6},
    POLLING : {val: "POLLING", isProcessedToConsensus : false, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 7},
    GOT_CONSENSUS : {val: "GOT_CONSENSUS", isProcessedToConsensus : true, isDone : false, canContinue: true, canRemoveSelf: false, ordinal: 8},
    DONE : {val: "DONE", isProcessedToConsensus : true, isDone : true, canContinue: true, canRemoveSelf: false, ordinal: 9},
    SENDING_CONSENSUS : {val: "SENDING_CONSENSUS", isProcessedToConsensus : true, isDone : true, canContinue: true, canRemoveSelf: false, ordinal: 10},
    FINISHED : {val: "FINISHED", isProcessedToConsensus : true, isDone : true, canContinue: true, canRemoveSelf: true, ordinal: 11},
    EMERGENCY_BREAK : {val: "EMERGENCY_BREAK", isProcessedToConsensus : false, isDone : false, canContinue: false, canRemoveSelf: true, ordinal: 12}
};

/**
 * Processor for item that will be processed from check to poll and other processes.
 *
 * Lifecycle of the item processor is:
 * - download
 * - check
 * - resync subitems (optinal)
 * - polling
 * - send consensus
 * - remove
 *
 * First of all item should be downloaded from other node or get from param of a constructor.
 *
 * Then item will be checked. Immediately after download if {@link ItemProcessor#isCheckingForce} is true
 * or after {@link ItemProcessor#forceChecking(boolean)} call. Will call {@link Approvable#check()}
 * or {@link Approvable#paymentCheck(Set)} if item is payment ({@link Approvable#shouldBeU()}).
 * Then subitems will be checked: {@link Approvable#getReferencedItems()} will checked if exists in the ledger;
 * {@link Approvable#getRevokingItems()} will checked if exists in the ledger and its
 * own {@link Approvable#getReferencedItems()} will recursively checked and will get {@link ItemState#LOCKED};
 * {@link Approvable#getNewItems()} will checked if errors exists (after {@link Approvable#check()} -
 * it recursively call check() for new items) and recursively checked for own references, revokes and new items,
 * if all is ok - item will get {@link ItemState#LOCKED_FOR_CREATION} state.
 *
 * While checking, after item itself checking but before subitems checking {@link ItemProcessor#isNeedToResync(boolean)}
 * calling. If return value is true item processor will go to resync subitems. Resync calls to nodes
 * about states of subitems and update consensus states. After resync back to check subitems.
 *
 * After checking item processor run polling. It set {@link ItemState#PENDING_POSITIVE} or {@link ItemState#PENDING_NEGATIVE}
 * state for processing item, send state to the network via {@link ItemProcessor#broadcastMyState()} and run polling.
 * While polling item processing wait for votes from other nodes and collect it
 * using {@link ItemProcessor#vote(NodeInfo, ItemState)}. When consensus is got item processor save item
 * to the ledger with consensus state via {@link ItemProcessor#approveAndCommit()} if consensus is positive or
 * via {@link ItemProcessor#rollbackChanges(ItemState)} if consensus is negative.
 *
 * Then item processor looking for nodes that not answered with for polling and send them new consensus until
 * they will have answered.
 *
 * And finally, if node got answers from all  other nodes - item processor removing via {@link ItemProcessor#removeSelf()}
 *
 * Look at {@link ItemProcessor#processingState} to know what happend with processing at calling time.
 *
 */
class ItemProcessor {

    constructor(itemId, parcelId, item, isCheckingForce, node) {
        /**
         * Item's id to be process.
         */
        this.itemId = itemId;
        /**
         * Parcel's id that item belongs to.
         */
        this.parcelId = parcelId;
        /**
         * Item object if exist.
         */
        this.item = item;
        /**
         * If true checking item processing without delays.
         * If false checking item wait until forceChecking() will be called.
         */
        this.isCheckingForce = isCheckingForce;
        this.processingState = ItemProcessingState.INIT;

        this.record = null;

        this.sources = new Set();

        this.positiveNodes = new Set();
        this.negativeNodes = new Set();

        this.resyncingItems = new t.GenericMap();
        this.resyncingItemsResults = new t.GenericMap();

        this.node = node;
        if (this.item == null)
            this.item = this.node.cache.get(itemId);

        this.lockedToRevoke = [];
        this.lockedToCreate = [];

        this.pollingExpiresAt = Date.now() + Config.maxElectionsTime * 1000;    // in milliseconds
        this.consensusReceivedExpiresAt = Date.now() + Config.maxConsensusReceivedCheckTime * 1000;    // in milliseconds

        this.alreadyChecked = false;

        this.extra = {};

        this.downloadedEvent = new AsyncEvent(this.node.executorService);
        this.doneEvent = new AsyncEvent(this.node.executorService);
        this.removedEvent = new Promise(resolve => this.removedFire = resolve);

        this.poller = null;
    }

    async run() {
        let recordWas = await this.node.ledger.getRecord(this.itemId);
        if (recordWas != null)
            this.stateWas = recordWas.state;
        else
            this.stateWas = ItemState.UNDEFINED;

        this.record = await this.node.ledger.findOrCreate(this.itemId);

        if (this.item != null)
            new ScheduleExecutor(() => this.itemDownloaded(), 0, this.node.executorService).run();

        return this;
    }

    //******************** download section ********************//

    pulseDownload() {
        if(this.processingState !== ItemProcessingState.EMERGENCY_BREAK) {

            if (!this.processingState.isProcessedToConsensus) {
                if(!this.processingState.isProcessedToConsensus) {
                    this.processingState = ItemProcessingState.DOWNLOADING;
                }

                if (this.item == null && (downloader == null || downloader.isDone)) {
                    //downloader = (ScheduledFuture<?>) executorService.submit(() => this.download(), //
                    //    Node.this.toString() + toString() + " :: item pulseDownload -> download");
                }

            }
        }
    }

    async download() {
        if(this.processingState !== ItemProcessingState.EMERGENCY_BREAK) {
            while (!this.isPollingExpired() && this.item == null) {
                if (this.sources.size === 0) {
                    // log.e("empty sources for download tasks, stopping"); //TODO
                    return;
                } else {
                    try {
                        // first we have to wait for sources
                        let source;
                        // Important: it could be disturbed by notifications
                        source = Do.sample(sources);

                        this.item = this.node.network.getItem(this.itemId, source, Config.maxGetItemTime);
                        if (this.item != null) {
                            this.itemDownloaded();
                            return;
                        } else {
                            await sleep(100);
                        }
                    } catch (err) {
                        this.logger.log(err.stack)
                    }
                }
            }
        }
    }

    async itemDownloaded() {
        this.node.report("item processor for item: ",  this.itemId, " from parcel: ", this.parcelId,
            " :: itemDownloaded, state ", this.processingState, " itemState: ", this.record.state, VerboseLevel.BASE);
        if(this.processingState !== ItemProcessingState.EMERGENCY_BREAK) {
            this.node.cache.put(this.item, this.getResult(), this.record);

            //save item in disk cache
            await this.node.ledger.putItem(this.record, this.item, Instant.now().plus(config.getMaxDiskCacheAge()));

            if(this.item instanceof Contract) {
                if(this.item.limitedForTestnet) {
                    this.markContractTest(this.item);
                }
            }

            if(!this.processingState.isProcessedToConsensus) {
                this.processingState = ItemProcessingState.DOWNLOADED;
            }
            if(this.isCheckingForce) {
                this.checkItem();
            }
            downloadedEvent.fire(); //TODO
        }
    }

    async markContractTest(contract) {
        await this.node.ledger.markTestRecord(contract.id);
        contract.new.forEach(c => this.markContractTest(c));
    }

    stopDownloader() {
        if (downloader != null)
            downloader.cancel(true);
    }

    //******************** check item section ********************//

    async checkItem() {
        this.node.report("item processor for item: ",
            this.itemId, " from parcel: ", this.parcelId,
            " :: checkItem, state ", this.processingState, " itemState: ", getState(),
            VerboseLevel.BASE);
        if(this.processingState.canContinue) {

            if (!this.processingState.isProcessedToConsensus()
                && this.processingState !== ItemProcessingState.POLLING
                && this.processingState !== ItemProcessingState.CHECKING
                && this.processingState !== ItemProcessingState.RESYNCING) {
                if (this.alreadyChecked) {
                    throw new Error("Check already processed");
                }

                if(!this.processingState.isProcessedToConsensus()) {
                    this.processingState = ItemProcessingState.CHECKING;
                }

                // Check the internal state
                // Too bad if basic check isn't passed, we will not process it further
                let itemsToResync = new Map();
                let needToResync = false;

                try {
                    let checkPassed;

                    if(this.item instanceof Contract) {
                        let referencedItems = this.item.transactionPack.getReferencedItems();
                        if(referencedItems.size > 0) {
                            let invalidItems = await this.node.ledger.findBadReferencesOf(referencedItems.keys());
                            invalidItems.forEach(id => referencedItems.delete(id));
                        }
                    }

                    if(this.item.shouldBeU) {
                        if(this.item.isU(this.node.config.uIssuerKeys, Config.uIssuerName)) {
                            checkPassed = this.item.paymentCheck(this.node.config.uIssuerKeys);
                        } else {
                            checkPassed = false;
                            //this.item.addError(Errors.BADSTATE, this.item.id),
                            //    "Item that should be U contract is not U contract"); //TODO
                        }
                    } else {
                        checkPassed = this.item.check();

                        // if item is smart contract we check it additionally
                        if(this.item instanceof NSmartContract) {
                            // slot contract need ledger, node's config and nodeInfo to work
                            this.item.nodeInfoProvider = this.node.nodeInfoProvider;

                            // restore environment if exist, otherwise create new.
                            let ime = this.node.getEnvironment(this.item);
                            ime.nameCache = this.node.nameCache; //TODO
                            // Here can be only APPROVED state, so we call only beforeCreate or beforeUpdate
                            if (this.item.revision === 1) {
                                if (!this.item.beforeCreate(ime))
                                this.item.addError(Errors.FAILED_CHECK, this.item.id, "beforeCreate fails");
                            } else {
                                if (!this.item.beforeUpdate(ime))
                                this.item.addError(Errors.FAILED_CHECK, this.item.id, "beforeUpdate fails");
                            }
                        }
                    }

                    if (checkPassed) {

                        itemsToResync = this.isNeedToResync(true);
                        needToResync = itemsToResync.size !== 0;

                        // If no need to resync subItems, check them
                        if (!needToResync) {
                            this.checkSubItems();
                        }
                    }

                } catch (e) {
                    this.item.addError(Errors.FAILURE, this.item.id.toString(),
                        "Not enough payment for process item (quantas limit)");
                    this.node.informer.inform(this.item);
                    emergencyBreak();
                    return;
                } /*catch (e) {
                    this.item.addError(Errors.FAILED_CHECK,this.item.id.toString(), "Exception during check: " + e.getMessage());
                    //if(verboseLevel > DatagramAdapter.VerboseLevel.NOTHING) {
                    e.printStackTrace();
                    //}
                    this.node.informer.inform(this.item);
                }*/
                this.alreadyChecked = true;

                if (!needToResync) {
                    this.commitCheckedAndStartPolling();
                } else {
                    for (let hid of itemsToResync.keys()) {
                        this.addItemToResync(hid, itemsToResync.get(hid));
                    }

                    this.startResync();
                }
            }
        }
    }

    // check subitems of main item and lock subitems in the ledger
    checkSubItems() {
        if(this.processingState.canContinue) {
            if (!this.processingState.isProcessedToConsensus) {
                this.checkSubItemsOf(this.item);
            }
        }
    }

    // check subitems of given item recursively (down for newItems line)
    checkSubItemsOf(checkingItem) {
        if(this.processingState.canContinue) {
            if (!this.processingState.isProcessedToConsensus) {

                // check all new new items in tree
                this.checkNewsOf(checkingItem);

                // check revoking items in tree
                this.checkRevokesOf(checkingItem);

            }
        }
    }

    checkRevokesOf(checkingItem) {
        if(this.processingState.canContinue) {
            if (!this.processingState.isProcessedToConsensus) {
                // check new items
                for (let newItem of checkingItem.getNewItems()) {
                    this.checkRevokesOf(newItem);

                    for (let err of newItem.getErrors()) {
                        checkingItem.errors.push(Errors.BAD_NEW_ITEM, newItem.id, "bad new item: " + err);
                    }
                }

                // check revoking items
                for (let revokingItem of checkingItem.getRevokingItems()) {

                    if (revokingItem instanceof Contract)
                        revokingItem.getErrors().clear();

                    // if revoking item is smart contract node additionally check it
                    if(revokingItem instanceof NSmartContract) {
                        // slot contract need ledger, node's config and nodeInfo to work
                        revokingItem.nodeInfoProvider = this.node.nodeInfoProvider;

                        // restore environment if exist
                        let ime = this.node.getEnvironment(revokingItem);

                        if(ime != null) {
                            ime.nameCache = this.node.nameCache;
                            // Here only REVOKED states, so we call only beforeRevoke
                            revokingItem.beforeRevoke(ime);
                        } else {
                            revokingItem.addError(Errors.FAILED_CHECK, revokingItem.id, "can't load environment to revoke");
                        }
                    }

                    for (let err of revokingItem.getErrors()) {
                        checkingItem.addError(Errors.BAD_REVOKE, revokingItem.id, "can't revoke: " + err);
                    }

                    try {
                        if (this.record.getState() === ItemState.APPROVED) {
                            // item can be approved by network consensus while our node do checking
                            // stop checking in this case
                            return;
                        }
                        /*itemLock.synchronize(revokingItem.id, lock -> {
                            let r = this.record.lockToRevoke(revokingItem.id);
                            if (r == null) {
                                checkingItem.addError(Errors.BAD_REVOKE, revokingItem.id, "can't revoke");
                            } else {
                                if (!this.lockedToRevoke.contains(r))
                                    this.lockedToRevoke.add(r);
                                if(r.getState() === ItemState.LOCKED_FOR_CREATION_REVOKED) {
                                    this.lockedToCreate.remove(r);
                                }
                            }
                            return null;
                        });*/
                    } catch (err) {
                        this.logger.log(err.stack)
                    }
                }
            }
        }
    }

    checkNewsOf(checkingItem) {
        if(this.processingState.canContinue) {
            if (!this.processingState.isProcessedToConsensus) {
                // check new items
                for (let newItem of checkingItem.newItems) {

                    this.checkNewsOf(newItem);

                    // if new item is smart contract we check it additionally
                    if(newItem instanceof NSmartContract) {
                        // slot contract need ledger, node's config and nodeInfo to work
                        newItem.nodeInfoProvider = nodeInfoProvider;

                        // restore environment if exist, otherwise create new.
                        let ime = this.node.getEnvironment(newItem);
                        ime.nameCache = this.node.nameCache;
                        // Here only APPROVED states, so we call only beforeCreate or beforeUpdate
                        if (newItem.revision === 1) {
                            if (!newItem.beforeCreate(ime))
                            newItem.addError(Errors.BAD_NEW_ITEM, this.item.id, "newItem.beforeCreate fails");
                        } else {
                            if (!newItem.beforeUpdate(ime))
                            newItem.addError(Errors.BAD_NEW_ITEM, this.item.id, "newItem.beforeUpdate fails");
                        }
                    }

                    if (!newItem.getErrors().isEmpty()) {
                        for (let er of newItem.getErrors()) {
                            checkingItem.addError(Errors.BAD_NEW_ITEM, newItem.id, "bad new item: " + er);
                        }
                    } else {
                        try {
                            if (this.record.state === ItemState.APPROVED) {
                                // item can be approved by network consensus while our node do checking
                                // stop checking in this case
                                return;
                            }
                            /*itemLock.synchronize(newItem.id, lock => {
                               let r = this.record.createOutputLockRecord(newItem.id);
                                if (r == null) {
                                    checkingItem.addError(Errors.NEW_ITEM_EXISTS, newItem.id, "new item exists in ledger");
                                } else {
                                    if (!this.lockedToCreate.contains(r))
                                        this.lockedToCreate.add(r);
                                }
                                return null;
                            });*/
                        } catch (err) {
                            this.logger.log(err.stack)
                        }
                    }
                }
            }
        }
    }

    async commitCheckedAndStartPolling() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: commitCheckedAndStartPolling, state " + this.processingState.val + " itemState: " + this.record.state,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        if (!this.processingState.isProcessedToConsensus) {
            let checkPassed = this.item.errors.length === 0;

            if (!checkPassed)
                this.node.informer.inform(this.item);

            this.record.expiresAt = this.item.getExpiresAt();

            if (this.record.state === ItemState.PENDING) {
                try {
                    if (checkPassed)
                        await this.record.setPendingPositive();
                    else
                        await this.record.setPendingNegative();

                    if (this.item != null)
                        this.node.cache.update(this.itemId, this.getResult());

                } catch (err) {
                    this.node.logger.log(err.stack);
                    this.node.logger.log("commitCheckedAndStartPolling error: " + err.message);
                    this.emergencyBreak();
                    return;
                }
            } else {
                this.node.logger.log("commitCheckedAndStartPolling: checked item state should be ItemState.PENDING");
                this.emergencyBreak();
            }

            if (!this.processingState.isProcessedToConsensus)
                this.processingState = ItemProcessingState.POLLING;

            this.vote(this.node.myInfo, this.record.state);
            this.broadcastMyState();
            this.pulseStartPolling();
            this.pollingReadyFire();
        }
    }

    async isNeedToResync(baseCheckPassed) {
        if (!this.processingState.canContinue)
            return new t.GenericMap();

        let unknownParts = new t.GenericMap();
        let knownParts = new t.GenericMap();

        if (baseCheckPassed) {
            // check the referenced items
            for (let ref of this.item.getReferencedItems()) {
                let r = await this.node.ledger.getRecord(ref.id);

                if (r == null || !r.state.isConsensusFound)
                    unknownParts.set(ref.id, r);
                else
                    knownParts.set(ref.id, r);
            }

            // check revoking items
            for (let rev of this.item.revokingItems) {
                let r = await this.node.ledger.getRecord(rev.id);

                if (r == null || !r.state.isConsensusFound)
                    unknownParts.set(rev.id, r);
                else
                    knownParts.set(rev.id, r);
            }
        }

        // contract is complex and consist from parts
        if ((unknownParts.size + knownParts.size > 0) && baseCheckPassed && unknownParts.size > 0 &&
            knownParts.size >= Config.knownSubContractsToResync)
            return unknownParts;

        return new t.GenericMap();
    }

    //******************** polling section ********************//

    broadcastMyState() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: broadcastMyState, state " + this.processingState.val + " itemState: " + this.record.state,
            VerboseLevel.BASE);

        if (this.processingState.canContinue) {
            let notification = new ParcelNotification(this.node.myInfo, this.itemId, this.parcelId, this.getResult(), true,
                this.item.shouldBeU ? ParcelNotificationType.PAYMENT : ParcelNotificationType.PAYLOAD);

            this.node.network.broadcast(this.node.myInfo, notification);
        }
    }

    pulseStartPolling() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: pulseStartPolling, state " + this.processingState.val + " itemState: " + this.record.state,
            VerboseLevel.BASE);

        if (this.processingState.canContinue)
            if (!this.processingState.isProcessedToConsensus)
                // at this point the item is with us, so we can start
                if (this.poller == null)
                    this.poller = new ExecutorWithDynamicPeriod(() => this.sendStartPollingNotification(),
                        Config.pollTimeMillis, this.node.executorService).run();
    }

    sendStartPollingNotification() {
        if (!this.processingState.canContinue)
            return;

        if (!this.processingState.isProcessedToConsensus) {
            if (this.isPollingExpired()) {
                // cancel by timeout expired
                this.processingState = ItemProcessingState.GOT_CONSENSUS;

                this.stopPoller();
                this.stopDownloader();
                this.rollbackChanges(ItemState.UNDEFINED);
                return;
            }

            // at this point we should to request the nodes that did not yet answered us
            let notification = new ParcelNotification(this.node.myInfo, this.itemId, this.parcelId, this.getResult(), true,
                this.item.shouldBeU ? ParcelNotificationType.PAYMENT : ParcelNotificationType.PAYLOAD);

            this.node.network.allNodes()
                .filter(n => (!this.positiveNodes.has(n) && !this.negativeNodes.has(n)))
                .forEach(n => this.node.network.deliver(n, notification));
        }
    }

    vote(node, state) {
        if (!this.processingState.canContinue)
            return;

        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: vote " + state.val + " from node " + node.number + ", state ", this.processingState.val +
            " :: itemState: " + this.record.state,
            VerboseLevel.BASE);

        let positiveConsensus = false;
        let negativeConsensus = false;

        // check if vote already count
        if ((state.isPositive() && this.positiveNodes.has(node)) ||
            (!state.isPositive() && this.negativeNodes.has(node)))
            return;

        if (this.processingState.canRemoveSelf)
            return;

        if (state.isPositive) {
            this.positiveNodes.add(node);
            this.negativeNodes.delete(node);
        } else {
            this.negativeNodes.add(node);
            this.positiveNodes.delete(node);
        }

        if (this.processingState.isProcessedToConsensus) {
            if (this.processingState.isDone)
                this.close();

            return;
        }

        if (this.negativeNodes.size >= this.node.config.negativeConsensus) {
            negativeConsensus = true;
            this.processingState = ItemProcessingState.GOT_CONSENSUS;
        } else if (this.positiveNodes.size >= this.node.config.positiveConsensus) {
            positiveConsensus = true;
            this.processingState = ItemProcessingState.GOT_CONSENSUS;
        }
        if (!this.processingState.isProcessedToConsensus)
            return;

        if (positiveConsensus)
            this.approveAndCommit();
        else if (negativeConsensus)
            this.rollbackChanges(ItemState.DECLINED);
        else
            throw new Error("error: consensus reported without consensus");
    }

    approveAndCommit() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: approveAndCommit, state " + this.processingState.val + " itemState: " + this.record.state,
            VerboseLevel.BASE);

        if (this.processingState.canContinue)
            // downloadAndCommit set state to APPROVED
            new ScheduleExecutor(() => this.downloadAndCommit(), 0, this.node.executorService).run();
    }

    // commit subitems of given item to the ledger (recursively)
    async downloadAndCommitNewItemsOf(commitingItem) {
        if (!this.processingState.canContinue)
            return;

        for (let newItem of commitingItem.newItems) {
            // The record may not exist due to ledger desync too, so we create it if need
            try {
                let r = await this.node.ledger.findOrCreate(newItem.id);
                try {
                    await r.approve(newItem.getExpiresAt());

                    //save newItem to DB in Permanet mode
                    if (this.node.config.permanetMode)
                        await this.node.ledger.putKeptItem(r, newItem);

                    let newExtraResult = {};
                    // if new item is smart contract node calls method onCreated or onUpdated
                    if (newItem instanceof NSmartContract) {
                        if (this.negativeNodes.has(this.node.myInfo))
                            this.addItemToResync(this.itemId, this.record);
                        else {
                            newItem.nodeInfoProvider = this.node.nodeInfoProvider;    //TODO: node.nodeInfoProvider

                            let ime = await this.node.getEnvironmentByItem(newItem);  //TODO: node.getEnvironmentByItem
                            ime.nameCache = this.node.nameCache;
                            let me = ime.getMutable();

                            if (newItem.state.revision === 1) {
                                // and call onCreated
                                newExtraResult.onCreatedResult = this.item.onCreated(me);
                            } else {
                                newExtraResult.onUpdateResult = this.item.onUpdated(me);

                                //TODO: callbackService
                                //new ScheduleExecutor(() => this.node.callbackService.synchronizeFollowerCallbacks(me.id),
                                //    1000, this.node.executorService).run();
                            }

                            await me.save();
                        }
                    }

                    // update new item's smart contracts link to
                    this.notifyContractSubscribers(newItem, r.state);

                    let result = ItemResult.fromStateRecord(r);
                    result.extra = newExtraResult;
                    if (this.node.cache.get(r.id) == null)
                        this.node.cache.put(newItem, result, r);
                    else
                        this.node.cache.update(r.id, result);

                } catch (err) {
                    this.emergencyBreak();
                    return null;
                }
                return null;

            } catch (err) {
                this.node.logger.log(err.stack);
                this.node.logger.log("error downloadAndCommitNewItemsOf: " + err.message);
            }

            //TODO: node.checkSpecialItem
            new ScheduleExecutor(() => this.node.checkSpecialItem(this.item), 100, this.node.executorService).run();

            await this.downloadAndCommitNewItemsOf(newItem);
        }
    }



    async downloadAndCommit() {
        if (!this.processingState.canContinue)
            return;

        // it may happen that consensus is found earlier than item is download
        // we still need item to fix all its relations:
        try {
            this.resyncingItems.clear();

            if (this.item == null) {
                // If positive consensus os found, we can spend more time for final download, and can try
                // all the network as the source:
                this.pollingExpiresAt = Date.now() + Config.maxDownloadOnApproveTime * 1000;
                await this.downloadedEvent.await(this.getMillisLeft());
            }
            // We use the caching capability of ledger so we do not get records from
            // lockedToRevoke/lockedToCreate, as, due to conflicts, these could differ from what the item
            // yields. We just clean them up afterwards:

            // first, commit all new items
            await this.downloadAndCommitNewItemsOf(this.item);

            // then, commit all revokes
            await this.downloadAndCommitRevokesOf(this.item);

            this.lockedToCreate.clear();
            this.lockedToRevoke.clear();

            try {
                await this.record.approve(this.item.getExpiresAt());

                if (this.item != null) {
                    cache.update(this.itemId, this.getResult());

                    //save item to DB in Permanet mode
                    if (config.permanetMode)
                        await this.node.ledger.putKeptItem(this.record, this.item);
                }
            } catch (err) {
                this.emergencyBreak();
                return;
            }

            if (this.record.state !== ItemState.APPROVED)
                this.node.logger.log("ERROR: record is not approved " + this.record.state);

            try {
                // if item is smart contract node calls onCreated or onUpdated
                if (this.item instanceof NSmartContract) {
                    // slot need ledger, config and nodeInfo for processing
                    this.item.nodeInfoProvider = this.node.nodeInfoProvider;        //TODO: node.nodeInfoProvider

                    if (this.negativeNodes.has(this.node.myInfo))
                        this.addItemToResync(this.item.id, this.record);
                    else {
                        let ime = await this.node.getEnvironmentByItem(this.item);  //TODO: node.getEnvironmentByItem
                        ime.nameCache = this.node.nameCache;
                        let me = ime.getMutable();

                        if (this.item.state.revision === 1) {
                            // and call onCreated
                            this.extra.onCreatedResult = this.item.onCreated(me);
                        } else {
                            this.extra.onUpdateResult = this.item.onUpdated(me);

                            //TODO: callbackService
                            //new ScheduleExecutor(() => this.node.callbackService.synchronizeFollowerCallbacks(me.id),
                            //    1000, this.node.executorService).run();
                        }

                        await me.save();

                        if (this.item != null)
                            cache.update(this.itemId, this.getResult());
                    }

                    let extraResult = this.item.getExtraResultForApprove();
                    for (let k of Object.keys(extraResult))
                        this.extra[k] = extraResult[k];
                }

                // update item's smart contracts link to
                this.notifyContractSubscribers(this.item, this.record.state);

            } catch (err) {
                this.node.logger.log(err.stack);
                this.node.logger.log("error downloadAndCommit for NSmartContract: " + err.message);
            }

            //TODO: node.checkSpecialItem
            new ScheduleExecutor(() => this.node.checkSpecialItem(this.item), 100, this.node.executorService).run();

            if (this.resyncingItems.size > 0) {
                this.processingState = ItemProcessingState.RESYNCING;
                this.startResync();
                return;
            }

        } catch (err) {
            if (!err instanceof EventTimeoutError)
                throw err;

            this.node.report("timeout " + this.itemId + " from parcel: " + this.parcelId +
                " :: downloadAndCommit timeoutException, state " + this.processingState.val + " itemState: " + this.record.state,
                VerboseLevel.NOTHING);

            this.node.logger.log(err.stack);

            try {
                await this.record.destroy();

                if (this.item != null)
                    this.node.cache.update(this.itemId, null);
            } catch (err2) {
                this.node.logger.log(err2.stack);
                this.node.logger.log("destroy record by timeout error: " + err2.message);
            }
        }

        this.close();
    }

    isPollingExpired() {
        return this.pollingExpiresAt < Date.now();
    }

    getMillisLeft() {
        return this.pollingExpiresAt - Date.now();
    }

    //******************** common section ********************//

    isConsensusReceivedExpired() {
        return this.consensusReceivedExpiresAt < Date.now();
    }

    getResult() {
        let result = ItemResult.fromStateRecord(this.record, this.item != null);
        result.extra = this.extra;
        if (this.item != null)
            result.errors = [...this.item.errors];
        return result;
    }
}



module.exports = {ItemProcessor, ItemProcessingState};