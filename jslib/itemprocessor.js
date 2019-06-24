import {ScheduleExecutor, ExecutorWithDynamicPeriod, EventTimeoutError, AsyncEvent} from "executorservice";
import {VerboseLevel} from "node_consts";
import {ParcelNotification, ParcelNotificationType} from "notification";
import {Errors, ErrorRecord} from "errors";
import {ApprovedEvent, RevokedEvent, ApprovedWithCallbackEvent, RevokedWithCallbackEvent} from "services/contractSubscription";
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const Config = require("config").Config;
const Contract = require("contract").Contract;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const t = require("tools");
const ResyncingItem = require("resyncprocessor").ResyncingItem;
const QuantiserException = require("quantiser").QuantiserException;
const DatabaseError = require("db_driver").DatabaseError;

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
 * or after {@link ItemProcessor#forceChecking(boolean)} call. Will call {@link Contract#check()}
 * or {@link Contract#paymentCheck(Set)} if item is payment ({@link Contract#shouldBeU()}).
 * Then subitems will be checked: {@link Contract#getReferencedItems()} will checked if exists in the ledger;
 * {@link Contract#revokingItems} will checked if exists in the ledger and its
 * own {@link Contract#getReferencedItems()} will recursively checked and will get {@link ItemState#LOCKED};
 * {@link Contract#newItems} will checked if errors exists (after {@link Contract#check()} -
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
 */
class ItemProcessor {

    /**
     * @param {crypto.HashId} itemId - Item's id to be process.
     * @param {crypto.HashId} parcelId - Parcel's id that item belongs to.
     * @param {Contract | null} item - Item object if exist.
     * @param {boolean} isCheckingForce - If true checking item processing without delays. If false checking item wait until forceChecking() will be called.
     * @param {Node} node - ItemProcessor`s node.
     *
     * @constructor
     */
    constructor(itemId, parcelId, item, isCheckingForce, node) {
        this.itemId = itemId;
        this.parcelId = parcelId;
        this.item = item;
        this.isCheckingForce = isCheckingForce;

        this.processingState = ItemProcessingState.INIT;

        this.record = null;

        this.sources = new t.GenericSet();

        this.positiveNodes = new t.GenericSet();
        this.negativeNodes = new t.GenericSet();

        this.resyncingItems = new t.GenericMap();
        this.resyncingItemsResults = new t.GenericMap();

        this.node = node;
        if (this.item == null)
            this.item = this.node.cache.get(itemId);

        this.lockedToRevoke = new t.GenericSet();
        this.lockedToCreate = new t.GenericSet();

        this.pollingExpiresAt = Date.now() + Config.maxElectionsTime * 1000;    // in milliseconds
        this.consensusReceivedExpiresAt = Date.now() + Config.maxConsensusReceivedCheckTime * 1000;    // in milliseconds

        this.alreadyChecked = false;

        this.extra = {};

        this.downloadedEvent = new AsyncEvent(this.node.executorService);
        this.doneEvent = new AsyncEvent(this.node.executorService);
        this.removedEvent = new Promise(resolve => this.removedFire = resolve);

        this.downloader = null;
        this.poller = null;
        this.consensusReceivedChecker = null;

        this.mutex = HashId.of(randomBytes(64));
    }

    async run() {
        this.record = await this.node.ledger.findOrCreate(this.itemId);

        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: created, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.item != null)
            new ScheduleExecutor(async () => await this.itemDownloaded(), 0, this.node.executorService).run();

        return this;
    }

    //******************** download section ********************//

    pulseDownload() {
        if (this.processingState.canContinue && !this.processingState.isProcessedToConsensus) {
            this.processingState = ItemProcessingState.DOWNLOADING;

            if (this.item == null && this.downloader == null)
                this.downloader = new ScheduleExecutor(async () => await this.download(), 0, this.node.executorService).run();
        }
    }

    async download() {
        if (this.processingState.canContinue) {
            while (!this.isPollingExpired() && this.item == null) {
                if (this.sources.size === 0) {
                    this.node.logger.log("empty sources for download tasks, stopping");
                    break;
                } else {
                    try {
                        // first we have to wait for sources
                        let source = Array.from(this.sources)[Math.floor(Math.random() * this.sources.size)];

                        this.item = await this.node.network.getItem(this.itemId, source, Config.maxGetItemTime * 1000);
                        if (this.item != null) {
                            await this.itemDownloaded();
                            break;
                        } else
                            await sleep(100);

                    } catch (err) {
                        this.node.logger.log(err.stack);
                        this.node.logger.log("download ERROR: " + err.message);
                    }
                }
            }
        }

        this.downloader = null;
    }

    async itemDownloaded() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: itemDownloaded, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        this.node.cache.put(this.item, this.getResult(), this.record);

        await this.node.lock.synchronize(this.mutex, async () => {
            //save item in disk cache
            let keepTill = new Date();
            keepTill.setSeconds(keepTill.getSeconds() + Config.maxDiskCacheAge);
            await this.node.ledger.putItem(this.record, this.item, keepTill);
        });

        if (this.item instanceof Contract && this.item.limitedForTestnet)
            await this.markContractTest(this.item);

        if (!this.processingState.isProcessedToConsensus)
            this.processingState = ItemProcessingState.DOWNLOADED;

        if (this.isCheckingForce)
            await this.checkItem();

        this.downloadedEvent.fire();
    }

    async markContractTest(contract) {
        await this.node.ledger.markTestRecord(contract.id);

        contract.newItems.forEach(c => this.markContractTest(c));
    }

    stopDownloader() {
        if (this.downloader != null) {
            this.downloader.cancel();
            this.downloader = null;
        }
    }

    //******************** check item section ********************//

    async checkItem() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: checkItem, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        if (!this.processingState.isProcessedToConsensus
            && this.processingState !== ItemProcessingState.POLLING
            && this.processingState !== ItemProcessingState.CHECKING
            && this.processingState !== ItemProcessingState.RESYNCING) {

            if (this.alreadyChecked)
                throw new Error("Check already processed");

            if (!this.processingState.isProcessedToConsensus)
                this.processingState = ItemProcessingState.CHECKING;

            // Check the internal state
            // Too bad if basic check isn't passed, we will not process it further
            let itemsToResync = new t.GenericMap();
            let needToResync = false;

            try {
                let checkPassed = false;

                if (this.item instanceof Contract && this.item.transactionPack != null) {
                    let referencedItems = this.item.transactionPack.referencedItems;
                    if (referencedItems.size > 0) {
                        let invalidItems = await this.node.ledger.findBadReferencesOf(new t.GenericSet(referencedItems.keys()));
                        invalidItems.forEach(id => referencedItems.delete(id));
                    }
                }

                if (this.item.shouldBeU) {
                    if (this.item.isU(this.node.config.uIssuerKeys, Config.uIssuerName))
                        checkPassed = await this.item.paymentCheck(this.node.config.uIssuerKeys);
                    else {
                        checkPassed = false;
                        this.item.errors.push(new ErrorRecord(Errors.BADSTATE, this.item.id.toString(),
                            "Item that should be U contract is not U contract"));
                    }
                } else {
                    checkPassed = await this.item.check();

                    // if item is smart contract we check it additionally
                    if (this.item instanceof NSmartContract) {
                        // slot contract need ledger, node's config and nodeInfo to work
                        this.item.nodeInfoProvider = this.node.nodeInfoProvider;

                        // restore environment if exist, otherwise create new.
                        let ime = await this.node.getEnvironmentByContract(this.item);
                        ime.nameCache = this.node.nameCache;
                        // Here can be only APPROVED state, so we call only beforeCreate or beforeUpdate
                        if (this.item.state.revision === 1) {
                            if (!this.item.beforeCreate(ime))
                                this.item.errors.push(new ErrorRecord(Errors.FAILED_CHECK, this.item.id.toString(),
                                    "beforeCreate fails"));
                        } else {
                            if (!this.item.beforeUpdate(ime))
                                this.item.errors.push(new ErrorRecord(Errors.FAILED_CHECK, this.item.id.toString(),
                                    "beforeUpdate fails"));
                        }
                    }
                }

                if (checkPassed) {
                    itemsToResync = await this.isNeedToResync(true);
                    needToResync = itemsToResync.size > 0;

                    // If no need to resync subItems, check them
                    if (!needToResync)
                        await this.checkSubItems();
                }

            } catch (err) {
                if (err instanceof QuantiserException) {
                    this.item.errors.push(new ErrorRecord(Errors.FAILURE, this.item.id.toString(),
                        "Not enough payment for process item (quantas limit)"));
                    this.node.informer.inform(this.item);
                    await this.emergencyBreak();
                    return;

                } else {
                    this.item.errors.push(new ErrorRecord(Errors.FAILED_CHECK, this.item.id.toString(),
                        "Exception during check: " + err.message));
                    this.node.logger.log(err.stack);
                    this.node.logger.log("checkItem ERROR: " + err.message);
                    this.node.informer.inform(this.item);
                }
            }

            this.alreadyChecked = true;

            if (!needToResync)
                await this.commitCheckedAndStartPolling();
            else {
                for (let hid of itemsToResync.keys())
                    this.addItemToResync(hid, itemsToResync.get(hid));

                await this.startResync();
            }

        }
    }

    // check subitems of main item and lock subitems in the ledger
    async checkSubItems() {
        if (this.processingState.canContinue && !this.processingState.isProcessedToConsensus)
            await this.checkSubItemsOf(this.item);
    }

    // check subitems of given item recursively (down for newItems line)
    async checkSubItemsOf(checkingItem) {
        if (!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        // check all new new items in tree
        await this.checkNewsOf(checkingItem);

        // check revoking items in tree
        await this.checkRevokesOf(checkingItem);
    }

    async checkRevokesOf(checkingItem) {
        if (!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        // check new items
        for (let newItem of checkingItem.newItems) {
            await this.checkRevokesOf(newItem);

            for (let err of newItem.errors)
                checkingItem.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM, newItem.id.toString(),
                    "bad new item: " + err.toString()));
        }

        // check revoking items
        for (let revokingItem of checkingItem.revokingItems) {

            if (revokingItem instanceof Contract)
                revokingItem.errors = [];

            // if revoking item is smart contract node additionally check it
            if (revokingItem instanceof NSmartContract) {
                // slot contract need ledger, node's config and nodeInfo to work
                revokingItem.nodeInfoProvider = this.node.nodeInfoProvider;

                // restore environment if exist
                let ime = await this.node.getEnvironmentByContract(revokingItem);

                if (ime != null) {
                    ime.nameCache = this.node.nameCache;
                    // Here only REVOKED states, so we call only beforeRevoke
                    revokingItem.beforeRevoke(ime);
                } else
                    revokingItem.errors.push(new ErrorRecord(Errors.FAILED_CHECK, revokingItem.id.toString(),
                        "can't load environment to revoke"));
            }

            for (let err of revokingItem.errors)
                checkingItem.errors.push(new ErrorRecord(Errors.BAD_REVOKE, revokingItem.id.toString(),
                    "can't revoke: " + err.toString()));

            await this.node.lock.synchronize(this.mutex, async () => {
                try {
                    if (this.record.state === ItemState.APPROVED)
                    // item can be approved by network consensus while our node do checking
                    // stop checking in this case
                        return;

                    await this.node.lock.synchronize(revokingItem.id, async () => {
                        let r = await this.record.lockToRevoke(revokingItem.id);
                        if (r == null)
                            checkingItem.errors.push(new ErrorRecord(Errors.BAD_REVOKE, revokingItem.id.toString(), "can't revoke"));
                        else {
                            if (!this.lockedToRevoke.has(r))
                                this.lockedToRevoke.add(r);

                            if (r.state === ItemState.LOCKED_FOR_CREATION_REVOKED)
                                this.lockedToCreate.delete(r);
                        }
                    });

                } catch (err) {
                    this.node.logger.log(err.stack);
                    this.node.logger.log("checkRevokesOf ERROR: " + err.message);
                }
            });
        }
    }

    async checkNewsOf(checkingItem) {
        if (!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        // check new items
        for (let newItem of checkingItem.newItems) {

            await this.checkNewsOf(newItem);

            // if new item is smart contract we check it additionally
            if (newItem instanceof NSmartContract) {
                // slot contract need ledger, node's config and nodeInfo to work
                newItem.nodeInfoProvider = nodeInfoProvider;

                // restore environment if exist, otherwise create new.
                let ime = await this.node.getEnvironmentByContract(newItem);
                ime.nameCache = this.node.nameCache;
                // Here only APPROVED states, so we call only beforeCreate or beforeUpdate
                if (newItem.state.revision === 1) {
                    if (!newItem.beforeCreate(ime))
                        newItem.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM, this.item.id.toString(),
                            "newItem.beforeCreate fails"));
                } else {
                    if (!newItem.beforeUpdate(ime))
                        newItem.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM, this.item.id.toString(),
                            "newItem.beforeUpdate fails"));
                }
            }

            if (newItem.errors.length > 0) {
                for (let err of newItem.errors)
                    checkingItem.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM, newItem.id.toString(),
                        "bad new item: " + err.toString()));
            } else {
                await this.node.lock.synchronize(this.mutex, async () => {
                    try {
                        if (this.record.state === ItemState.APPROVED)
                        // item can be approved by network consensus while our node do checking
                        // stop checking in this case
                            return;

                        await this.node.lock.synchronize(newItem.id, async () => {
                            let r = await this.record.lockForCreate(newItem.id);
                            if (r == null)
                                checkingItem.errors.push(new ErrorRecord(Errors.NEW_ITEM_EXISTS, newItem.id.toString(),
                                    "new item exists in ledger"));
                            else if (!this.lockedToCreate.has(r))
                                this.lockedToCreate.add(r);
                        });

                    } catch (err) {
                        this.node.logger.log(err.stack);
                        this.node.logger.log("checkNewsOf ERROR: " + err.message);
                    }
                });
            }
        }
    }

    async commitCheckedAndStartPolling() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: commitCheckedAndStartPolling, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        if (!this.processingState.isProcessedToConsensus) {
            let checkPassed = this.item.errors.length === 0;

            if (!checkPassed)
                this.node.informer.inform(this.item);

            this.record.expiresAt = this.item.getExpiresAt();

            if (!await this.node.lock.synchronize(this.mutex, async () => {
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
                        await this.emergencyBreak();
                        return false;
                    }
                } else {
                    this.node.logger.log("commitCheckedAndStartPolling: checked item state should be ItemState.PENDING");
                    await this.emergencyBreak();
                }

                return true;
            }))
                return;

            if (!this.processingState.isProcessedToConsensus)
                this.processingState = ItemProcessingState.POLLING;

            await this.vote(this.node.myInfo, this.record.state);
            this.broadcastMyState();
            this.pulseStartPolling();
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
            " :: broadcastMyState, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.processingState.canContinue) {
            let notification = new ParcelNotification(this.node.myInfo, this.itemId, this.parcelId, this.getResult(), true,
                this.item.shouldBeU ? ParcelNotificationType.PAYMENT : ParcelNotificationType.PAYLOAD);

            this.node.network.broadcast(this.node.myInfo, notification);
        }
    }

    pulseStartPolling() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: pulseStartPolling, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.processingState.canContinue && !this.processingState.isProcessedToConsensus && this.poller == null)
            // at this point the item is with us, so we can start
            this.poller = new ExecutorWithDynamicPeriod(async () => await this.sendStartPollingNotification(), Config.pollTimeMillis,
                this.node.executorService).run();
    }

    async sendStartPollingNotification() {
        if (!this.processingState.canContinue)
            return;

        if (!this.processingState.isProcessedToConsensus) {
            if (this.isPollingExpired()) {
                // cancel by timeout expired
                this.processingState = ItemProcessingState.GOT_CONSENSUS;

                this.stopPoller();
                this.stopDownloader();
                await this.rollbackChanges();
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

    async vote(node, state) {
        if (!this.processingState.canContinue)
            return;

        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: vote " + state.val + " from node " + node.number + ", state " + this.processingState.val +
            " :: itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        let positiveConsensus = false;
        let negativeConsensus = false;

        // check if vote already count
        if ((state.isPositive && this.positiveNodes.has(node)) ||
            (!state.isPositive && this.negativeNodes.has(node)))
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
            await this.rollbackChanges(true);
        else
            throw new Error("error: consensus reported without consensus");
    }

    approveAndCommit() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: approveAndCommit, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.processingState.canContinue)
            // downloadAndCommit set state to APPROVED
            new ScheduleExecutor(async () => await this.downloadAndCommit(), 0, this.node.executorService).run();
    }

    // commit subitems of given item to the ledger (recursively)
    async downloadAndCommitNewItemsOf(commitingItem, con) {
        if (!this.processingState.canContinue)
            return;

        for (let newItem of commitingItem.newItems) {
            await this.node.lock.synchronize(newItem.id, async () => {
                // The record may not exist due to ledger desync too, so we create it if need
                let r = await this.node.ledger.simpleFindOrCreate(newItem.id, ItemState.PENDING, 0, con);

                await r.approve(con, newItem.getExpiresAt());

                //save newItem to DB in Permanet mode
                if (this.node.config.permanetMode)
                    await this.node.ledger.putKeptItem(r, newItem, con);

                let newExtraResult = {};
                // if new item is smart contract node calls method onCreated or onUpdated
                if (newItem instanceof NSmartContract) {
                    if (this.negativeNodes.has(this.node.myInfo))
                        this.addItemToResync(this.itemId, this.record);
                    else {
                        newItem.nodeInfoProvider = this.node.nodeInfoProvider;

                        let ime = await this.node.getEnvironmentByContract(newItem, con);
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

                        await me.save(con);
                    }
                }

                // update new item's smart contracts link to
                await this.notifyContractSubscribers(newItem, r.state, con);

                let result = ItemResult.fromStateRecord(r);
                result.extra = newExtraResult;
                if (this.node.cache.get(r.id) == null)
                    this.node.cache.put(newItem, result, r);
                else
                    this.node.cache.update(r.id, result);
            });

            new ScheduleExecutor(() => this.node.checkSpecialItem(this.item), 100, this.node.executorService).run();

            await this.downloadAndCommitNewItemsOf(newItem, con);
        }
    }

    // commit subitems of given item to the ledger (recursively)
    async downloadAndCommitRevokesOf(commitingItem, con) {
        if (!this.processingState.canContinue)
            return;

        for (let revokingItem of commitingItem.revokingItems)
            await this.node.lock.synchronize(revokingItem.id, async () => {
                // The record may not exist due to ledger desync, so we create it if need
                let r = await this.node.ledger.simpleFindOrCreate(revokingItem.id, ItemState.PENDING, 0, con);

                await r.revoke(con);

                let revokingProcessor = this.node.processors.get(revokingItem.id);
                if (revokingProcessor != null)
                    revokingProcessor.forceRemoveSelf();

                // if revoking item is smart contract node calls method onRevoked
                if (revokingItem instanceof NSmartContract && !this.searchNewItemWithParent(this.item, revokingItem.id)) {
                    revokingItem.nodeInfoProvider = this.node.nodeInfoProvider;

                    let ime = await this.node.getEnvironmentByContract(revokingItem, con);
                    if (ime != null) {
                        // and run onRevoked
                        revokingItem.onRevoked(ime);
                        await this.node.removeEnvironment(revokingItem.id, con);
                    }
                }

                await this.notifyContractSubscribers(revokingItem, r.state, con);

                let result = ItemResult.fromStateRecord(r);
                if (this.node.cache.get(r.id) == null)
                    this.node.cache.put(revokingItem, result, r);
                else
                    this.node.cache.update(r.id, result);
            });

        for (let newItem of commitingItem.newItems)
            await this.downloadAndCommitRevokesOf(newItem, con);
    }

    searchNewItemWithParent(item, id) {
        if (item instanceof Contract && item.state.parent != null && item.state.parent.equals(id))
            return true;

        for (let newItem of item.newItems)
            if (this.searchNewItemWithParent(newItem, id))
                return true;

        return false;
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

            await this.node.lock.synchronize(this.mutex, async () => {
                // Commit transaction
                await this.node.ledger.transaction(async(con) => {
                    // first, commit all new items
                    await this.downloadAndCommitNewItemsOf(this.item, con);

                    // then, commit all revokes
                    await this.downloadAndCommitRevokesOf(this.item, con);

                    // We use the caching capability of ledger so we do not get records from
                    // lockedToRevoke/lockedToCreate, as, due to conflicts, these could differ from what the item
                    // yields. We just clean them up afterwards:
                    this.lockedToCreate.clear();
                    this.lockedToRevoke.clear();

                    await this.record.approve(con, this.item.getExpiresAt());

                    if (this.item != null) {
                        this.node.cache.update(this.itemId, this.getResult());

                        //save item to DB in Permanet mode
                        if (this.node.config.permanetMode)
                            await this.node.ledger.putKeptItem(this.record, this.item, con);
                    }

                    if (this.record.state !== ItemState.APPROVED)
                        this.node.logger.log("ERROR: record is not approved " + this.record.state.val);

                    // if item is smart contract node calls onCreated or onUpdated
                    if (this.item instanceof NSmartContract) {
                        // slot need ledger, config and nodeInfo for processing
                        this.item.nodeInfoProvider = this.node.nodeInfoProvider;

                        if (this.negativeNodes.has(this.node.myInfo))
                            this.addItemToResync(this.item.id, this.record);
                        else {
                            let ime = await this.node.getEnvironmentByContract(this.item, con);
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

                            await me.save(con);

                            if (this.item != null)
                                cache.update(this.itemId, this.getResult());
                        }

                        let extraResult = this.item.getExtraResultForApprove();
                        for (let k of Object.keys(extraResult))
                            this.extra[k] = extraResult[k];
                    }

                    // update item's smart contracts link to
                    await this.notifyContractSubscribers(this.item, this.record.state, con);
                });
            });

            new ScheduleExecutor(() => this.node.checkSpecialItem(this.item), 100, this.node.executorService).run();

            if (this.resyncingItems.size > 0) {
                this.processingState = ItemProcessingState.RESYNCING;
                await this.startResync();
                return;
            }

        } catch (err) {
            if (err instanceof DatabaseError) {
                this.node.logger.log(err.stack);
                this.node.logger.log("DatabaseError downloadAndCommit in transaction: " + err.message);
                await this.emergencyBreak();
                return;

            } else if (err instanceof EventTimeoutError) {
                this.node.report("timeout " + this.itemId + " from parcel: " + this.parcelId +
                    " :: downloadAndCommit timeoutException, state " + this.processingState.val + " itemState: " +
                    this.record.state.val, VerboseLevel.NOTHING);

                this.node.logger.log(err.stack);

                try {
                    await this.node.lock.synchronize(this.record.id, async () => {
                        await this.record.destroy();

                        if (this.item != null)
                            this.node.cache.update(this.itemId, null);
                    });
                } catch (lerr) {
                    this.node.logger.log(lerr.stack);
                    this.node.logger.log("destroy record by timeout error: " + lerr.message);
                }

            } else {
                this.node.logger.log(err.stack);
                this.node.logger.log("error downloadAndCommit in transaction: " + err.message);
            }
        }

        this.close();
    }

    /**
     * Method looking for item's subscriptions and if it exist fire events.
     *
     * @param {Contract} updatingItem - Item that processing.
     * @param {ItemState} updatingState - State that is consensus for processing item.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     */
    async notifyContractSubscribers(updatingItem, updatingState, con = undefined) {
        try {
            let lookingId = null;
            let origin = null;

            // we are looking for updatingItem's parent subscriptions and want to update it
            if (updatingState === ItemState.APPROVED)
                if (updatingItem instanceof Contract && updatingItem.state.parent != null)
                    lookingId = updatingItem.state.parent;

            // we are looking for own id and will update own subscriptions
            if (updatingState === ItemState.REVOKED)
                lookingId = updatingItem.id;

            // we are looking for updatingItem's subscriptions by origin
            if (updatingItem instanceof Contract && (updatingState === ItemState.APPROVED || updatingState === ItemState.REVOKED))
                origin = updatingItem.getOrigin();

            // find all environments that have subscription for item
            let environmentIds = new Set();
            if (lookingId != null) {
                let environmentIdsForContractId = await this.node.ledger.getSubscriptionEnviromentIds(lookingId, con);
                environmentIdsForContractId.forEach(envId => environmentIds.add(envId));
            }

            if (origin != null) {
                let environmentIdsForOrigin = await this.node.ledger.getSubscriptionEnviromentIds(origin, con);
                environmentIdsForOrigin.forEach(envId => environmentIds.add(envId));
            }

            for (let environmentId of environmentIds)
                await this.node.lock.synchronize("callbackService", async () => {
                    let ime = await this.node.getEnvironment(environmentId, con);
                    ime.nameCache = this.node.nameCache;
                    let contract = ime.getContract();
                    contract.nodeInfoProvider = this.node.nodeInfoProvider;
                    let me = ime.getMutable();

                    for (let sub of ime.subscriptions()) {
                        if (lookingId != null && sub.getContractId() != null && lookingId.equals(sub.getContractId())) {
                            if (updatingState === ItemState.APPROVED) {
                                let event = new ApprovedEvent();
                                event.getNewRevision = () => updatingItem;
                                event.getPackedTransaction = () => updatingItem.getPackedTransaction();
                                event.getEnvironment = () => me;
                                event.getSubscription = () => sub;

                                contract.onContractSubscriptionEvent(event);
                                await me.save(con);
                            }

                            if (updatingState === ItemState.REVOKED) {
                                let event = new RevokedEvent();
                                event.getEnvironment = () => me;
                                event.getSubscription = () => sub;

                                contract.onContractSubscriptionEvent(event);
                                await me.save(con);
                            }

                            break;
                        }

                        if (origin != null && sub.getOrigin() != null && origin.equals(sub.getOrigin())) {
                            if (contract.canFollowContract(updatingItem)) {
                                if (updatingState === ItemState.APPROVED) {
                                    let event = new ApprovedWithCallbackEvent();
                                    event.getNewRevision = () => updatingItem;
                                    event.getEnvironment = () => me;
                                    event.getCallbackService = () => this.node.callbackService;

                                    contract.onContractSubscriptionEvent(event);
                                    await me.save(con);
                                }

                                if (updatingState === ItemState.REVOKED) {
                                    let event = new RevokedWithCallbackEvent();
                                    event.getRevokingItem = () => updatingItem;
                                    event.getEnvironment = () => me;
                                    event.getCallbackService = () => this.node.callbackService;

                                    contract.onContractSubscriptionEvent(event);
                                    await me.save(con);
                                }
                            }

                            break;
                        }
                    }
                });

        } catch (err) {
            this.node.logger.log(err.stack);
            this.node.logger.log("error notifyContractSubscribers: " + err.message);
        }
    }

    async rollbackChanges(doDecline = false) {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: rollbackChanges, state " + this.processingState.val + " :: itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        await this.node.lock.synchronize(this.mutex, async () => {
            try {
                // Rollback transaction
                await this.node.ledger.transaction(async (con) => {
                    await Promise.all(Array.from(this.lockedToRevoke).map(async (r) =>
                        await this.node.lock.synchronize(r.id, async () => {
                            await r.unlock(con);

                            let cr = this.node.cache.getResult(r.id);
                            let rr = ItemResult.fromStateRecord(r);
                            if (cr != null)
                                rr.extra = cr.extra;
                            this.node.cache.update(r.id, rr);
                        })));

                    this.lockedToRevoke.clear();

                    // form created records, we touch only these that we have actually created
                    await Promise.all(Array.from(this.lockedToCreate).map(async (r) =>
                        await this.node.lock.synchronize(r.id, async () => {
                            await r.unlock(con);

                            let cr = this.node.cache.getResult(r.id);
                            let rr = ItemResult.fromStateRecord(r);
                            if (cr != null)
                                rr.extra = cr.extra;
                            this.node.cache.update(r.id, rr);
                        })));

                    this.lockedToCreate.clear();

                    if (doDecline) {
                        await this.record.decline(con);

                        if (this.item != null)
                            this.node.cache.update(this.itemId, this.getResult());
                    } else
                        await this.record.destroy(con);
                });
            } catch (err) {
                if (err instanceof DatabaseError) {
                    this.node.logger.log(err.stack);
                    this.node.logger.log("DatabaseError rollbackChanges in transaction: " + err.message);
                }
            }

            this.close();
        });
    }

    stopPoller() {
        if (this.poller != null) {
            this.poller.cancel();
            this.poller = null;
        }
    }

    isPollingExpired() {
        return this.pollingExpiresAt < Date.now();
    }

    //******************** sending new state section ********************//

    pulseSendNewConsensus() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: pulseSendNewConsensus, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        this.processingState = ItemProcessingState.SENDING_CONSENSUS;

        if (this.consensusReceivedChecker == null)
            this.consensusReceivedChecker = new ExecutorWithDynamicPeriod(async () => await this.sendNewConsensusNotification(),
                Config.consensusReceivedCheckTime, this.node.executorService).run();
    }

    async sendNewConsensusNotification() {
        if (!this.processingState.canContinue || this.processingState === ItemProcessingState.FINISHED)
            return;

        if (this.isConsensusReceivedExpired()) {
            this.node.report("consensus received expired " + this.itemId + " from parcel: " + this.parcelId +
                " :: sendNewConsensusNotification isConsensusReceivedExpired, state " + this.processingState.val +
                " itemState: " + this.record.state.val, VerboseLevel.NOTHING);

            // cancel by timeout expired
            this.processingState = ItemProcessingState.FINISHED;
            this.stopConsensusReceivedChecker();
            this.removeSelf();
            return;
        }

        // at this point we should requery the nodes that did not yet answered us
        let notification = new ParcelNotification(this.node.myInfo, this.itemId, this.parcelId, this.getResult(), true,
            this.item.shouldBeU ? ParcelNotificationType.PAYMENT : ParcelNotificationType.PAYLOAD);

        for (let n of this.node.network.allNodes())
            if (!this.positiveNodes.has(n) && !this.negativeNodes.has(n)) {
                // if node do not know own vote we do not send notification, just looking for own state
                if (!this.node.myInfo.equals(node))
                    this.node.network.deliver(node, notification);
                else if (this.processingState.isProcessedToConsensus)
                    await this.vote(this.node.myInfo, this.record.state);
            }
    }

    checkIfAllReceivedConsensus() {
        if (!this.processingState.canContinue)
            return true;

        let nodes = this.node.network.allNodes();
        let allReceived = nodes.length <= this.positiveNodes.size + this.negativeNodes.size;

        if (allReceived) {
            this.processingState = ItemProcessingState.FINISHED;
            this.stopConsensusReceivedChecker();
        }

        return allReceived;

    }

    isConsensusReceivedExpired() {
        return this.consensusReceivedExpiresAt < Date.now();
    }

    stopConsensusReceivedChecker() {
        if (this.consensusReceivedChecker != null)
            this.consensusReceivedChecker.cancel();
    }

    //******************** resync section ********************//

    async startResync() {
        if (!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        this.processingState = ItemProcessingState.RESYNCING;

        await Promise.all(Array.from(this.resyncingItems.keys()).map(
            async(k) => await this.node.resync(k, (re) => this.onResyncItemFinished(re))
        ));
    }

    async onResyncItemFinished(ri) {
        if (!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        this.resyncingItemsResults.set(ri.hashId, ri.getItemState());
        if (this.resyncingItemsResults.size >= this.resyncingItems.size)
            await this.onAllResyncItemsFinished();
    }

    async onAllResyncItemsFinished() {
        this.processingState = ItemProcessingState.CHECKING;

        try {
            await this.checkSubItems();
        } catch (err) {
            this.node.logger.log(err.stack);
            this.node.logger.log("onAllResyncItemsFinished ERROR: " + err.message);
            this.node.report("error: ItemProcessor.onAllResyncItemsFinished() exception: " + err.message, VerboseLevel.BASE);
        }

        await this.commitCheckedAndStartPolling();
    }

    addItemToResync(hid, record) {
        if (this.processingState.canContinue)
            if (this.resyncingItems.get(hid) == null)
                this.resyncingItems.set(hid, new ResyncingItem(hid, record, this.node));
    }

    //******************** common section ********************//

    getMillisLeft() {
        return this.pollingExpiresAt - Date.now();
    }

    /**
     * Start checking if item was downloaded and wait for isCheckingForce flag.
     * If item hasn't downloaded just set isCheckingForce for true.
     *
     * @param {boolean} isCheckingForce
     */
    forceChecking(isCheckingForce) {
        this.node.report("item processor for item: " +  this.itemId + " from parcel: " + this.parcelId +
            " :: forceChecking, state " + this.processingState.val + " itemState: " +  this.record.state.val,
            VerboseLevel.BASE);

        this.isCheckingForce = isCheckingForce;

        if (this.processingState === ItemProcessingState.DOWNLOADED)
            new ScheduleExecutor(async () => await this.checkItem(), 0, this.node.executorService).run();
    }

    close() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: close, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.processingState.canContinue)
            this.processingState = ItemProcessingState.DONE;

        this.stopPoller();

        // fire all event to release possible listeners
        this.downloadedEvent.fire();
        this.doneEvent.fire();

        if (this.processingState.canContinue) {
            this.checkIfAllReceivedConsensus();
            if (this.processingState === ItemProcessingState.DONE)
                this.pulseSendNewConsensus();
            else
                this.removeSelf();
        } else
            this.removeSelf();
    }

    /**
     * Emergency break all processes and remove self.
     */
    async emergencyBreak() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: emergencyBreak, state " + this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        let doRollback = !this.processingState.isDone;

        this.processingState = ItemProcessingState.EMERGENCY_BREAK;

        this.stopDownloader();
        this.stopPoller();
        this.stopConsensusReceivedChecker();

        for (let ri of this.resyncingItems.values())
            if (!ri.isCommitFinished())
                ri.closeByTimeout();

        if (doRollback)
            await this.rollbackChanges();
        else
            this.close();

        this.processingState = ItemProcessingState.FINISHED;
    }

    removeSelf() {
        this.node.report("item processor for item: " + this.itemId + " from parcel: " + this.parcelId +
            " :: removeSelf, state ", this.processingState.val + " itemState: " + this.record.state.val,
            VerboseLevel.BASE);

        if (this.processingState.canRemoveSelf)
            this.forceRemoveSelf();
    }

    forceRemoveSelf() {
        this.node.processors.delete(this.itemId);

        this.stopDownloader();
        this.stopPoller();
        this.stopConsensusReceivedChecker();

        // fire all event to release possible listeners
        this.downloadedEvent.fire();
        this.doneEvent.fire();
        this.removedFire();
    }

    getResult() {
        let result = ItemResult.fromStateRecord(this.record, this.item != null);
        result.extra = this.extra;
        if (this.item != null)
            result.errors = [...this.item.errors];
        return result;
    }

    /**
     * Check we need to get vote from a node.
     *
     * @param {network.NodeInfo} node - We might need vote from.
     * @return true if we need to get vote from a node.
     */
    needsVoteFrom(node) {
        return this.record.state.isPending && !this.positiveNodes.has(node) && !this.negativeNodes.has(node);
    }

    addToSources(node) {
        if (this.item != null)
            return;

        let has = this.sources.has(node);

        this.sources.add(node);
        if (!has)
            this.pulseDownload();
    }

    isDone() {
        return this.processingState.isDone;
    }

    toString() {
        return "ip -> parcel: " + this.parcelId + ", item: " + this.itemId + ", processing state: " + this.processingState.val;
    }
}

module.exports = {ItemProcessor, ItemProcessingState};