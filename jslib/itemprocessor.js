import {ScheduleExecutor} from "executorservice";
const Logger = require("logger").Logger;
const Config = require("config").Config;
const Contract = require("contract").Contract;
const NSmartContract = require("services/NSmartContract").NSmartContract;


const ItemProcessingState = {
    NOT_EXIST : {val: "NOT_EXIST", isProcessedToConsensus : false, isDone : false},
    INIT : {val: "INIT", isProcessedToConsensus : false, isDone : false},
    DOWNLOADING : {val: "DOWNLOADING", isProcessedToConsensus : false, isDone : false},
    DOWNLOADED : {val: "DOWNLOADED", isProcessedToConsensus : false, isDone : false},
    CHECKING : {val: "CHECKING", isProcessedToConsensus : false, isDone : false},
    RESYNCING : {val: "RESYNCING", isProcessedToConsensus : false, isDone : false},
    GOT_RESYNCED_STATE : {val: "GOT_RESYNCED_STATE", isProcessedToConsensus : false, isDone : false},
    POLLING : {val: "POLLING", isProcessedToConsensus : false, isDone : false},
    GOT_CONSENSUS : {val: "GOT_CONSENSUS", isProcessedToConsensus : true, isDone : false},
    DONE : {val: "DONE", isProcessedToConsensus : true, isDone : true},
    SENDING_CONSENSUS : {val: "SENDING_CONSENSUS", isProcessedToConsensus : true, isDone : true},
    FINISHED : {val: "FINISHED", isProcessedToConsensus : true, isDone : true},
    EMERGENCY_BREAK : {val: "EMERGENCY_BREAK", isProcessedToConsensus : false, isDone : false}
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

        this.logger = new Logger(4096);

        this.sources = new Set();

        this.positiveNodes = new Set();
        this.negativeNodes = new Set();

        this.node = node;
        if (this.item == null)
            this.item = this.node.cache.get(itemId);

        this.lockedToRevoke = [];
        this.lockedToCreate = [];

        this.pollingExpiresAt = new Date();
        this.pollingExpiresAt.setTime(this.pollingExpiresAt.getTime() + Config.maxElectionsTime);

        this.consensusReceivedExpiresAt = new Date();
        this.consensusReceivedExpiresAt.setTime(this.consensusReceivedExpiresAt.getTime() + Config.maxConsensusReceivedCheckTime);

        this.alreadyChecked = false;
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

    // download section

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
            this.node.cache.put(this.item, getResult()); //TODO

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

    // check item section

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

    commitCheckedAndStartPolling() {
       /* report(getLabel(), () -> concatReportMessage("item processor for item: ",
            itemId, " from parcel: ", parcelId,
            " :: commitCheckedAndStartPolling, state ", processingState, " itemState: ", getState()),
            DatagramAdapter.VerboseLevel.BASE);
        if(processingState.canContinue()) {

            if (!processingState.isProcessedToConsensus()) {
                boolean checkPassed = item.getErrors().isEmpty();

                if (!checkPassed) {
                    informer.inform(item);
                }

                synchronized (mutex) {
                    if (record.getState() == ItemState.PENDING) {
                        if (checkPassed) {
                            setState(ItemState.PENDING_POSITIVE);
                        } else {
                            setState(ItemState.PENDING_NEGATIVE);
                        }
                    }

                    record.setExpiresAt(item.getExpiresAt());
                    try {
                        if (record.getState() != ItemState.UNDEFINED) {
                            record.save();

                            if (item != null) {
                                synchronized (cache) {
                                    cache.update(itemId, getResult());
                                }
                            }
                        } else {
                            log.e("Checked item with state ItemState.UNDEFINED (should be ItemState.PENDING)");
                            emergencyBreak();
                        }
                    } catch (Ledger.Failure failure) {
                        emergencyBreak();
                        return;
                    }
                }

                if(!processingState.isProcessedToConsensus()) {
                    processingState = ItemProcessingState.POLLING;
                }

                vote(myInfo, record.getState());
                broadcastMyState();
                pulseStartPolling();
                pollingReadyEvent.fire();
            }
        }*/
    }

}



module.exports = {ItemProcessor, ItemProcessingState};