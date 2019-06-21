import {ScheduleExecutor, ExecutorWithDynamicPeriod, EventTimeoutError, AsyncEvent} from "executorservice";
import {VerboseLevel} from "node_consts";
import {Errors, ErrorRecord} from "errors";

const Quantiser = require("quantiser").Quantiser;
const ItemProcessor = require("itemprocessor").ItemProcessor;
import {randomBytes} from 'tools'

const ParcelProcessingState = {

    NOT_EXIST: {val:"NOT_EXIST", isProcessedToConsensus: false, isProcessing: false, canContinue: true, canRemoveSelf: false, ordinal: 0},
    INIT: {val:"INIT", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 1},
    DOWNLOADING: {val:"DOWNLOADING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 2},
    PREPARING: {val:"PREPARING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 3},
    PAYMENT_CHECKING: {val:"PAYMENT_CHECKING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 4},
    PAYLOAD_CHECKING: {val:"PAYLOAD_CHECKING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 5},
    RESYNCING: {val:"RESYNCING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 6},
    GOT_RESYNCED_STATE: {val:"GOT_RESYNCED_STATE", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 7},
    PAYMENT_POLLING: {val:"PAYMENT_POLLING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 8},
    PAYLOAD_POLLING: {val:"PAYLOAD_POLLING", isProcessedToConsensus: false, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 9},
    GOT_CONSENSUS: {val:"GOT_CONSENSUS", isProcessedToConsensus: true, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 10},
    SENDING_CONSENSUS: {val:"SENDING_CONSENSUS", isProcessedToConsensus: true, isProcessing: true, canContinue: true, canRemoveSelf: false, ordinal: 11},
    FINISHED: {val:"FINISHED", isProcessedToConsensus: true, isProcessing: false, canContinue: true, canRemoveSelf: true, ordinal: 12},
    EMERGENCY_BREAK: {val:"EMERGENCY_BREAK", isProcessedToConsensus: false, isProcessing: false, canContinue: false, canRemoveSelf: true, ordinal: 13}
};

ParcelProcessingState.byVal = new Map();
ParcelProcessingState.byVal.set(ParcelProcessingState.NOT_EXIST.val, ParcelProcessingState.NOT_EXIST);
ParcelProcessingState.byVal.set(ParcelProcessingState.INIT.val, ParcelProcessingState.INIT);
ParcelProcessingState.byVal.set(ParcelProcessingState.DOWNLOADING.val, ParcelProcessingState.DOWNLOADING);
ParcelProcessingState.byVal.set(ParcelProcessingState.PREPARING.val, ParcelProcessingState.PREPARING);
ParcelProcessingState.byVal.set(ParcelProcessingState.PAYMENT_CHECKING.val, ParcelProcessingState.PAYMENT_CHECKING);
ParcelProcessingState.byVal.set(ParcelProcessingState.PAYLOAD_CHECKING.val, ParcelProcessingState.PAYLOAD_CHECKING);
ParcelProcessingState.byVal.set(ParcelProcessingState.RESYNCING.val, ParcelProcessingState.RESYNCING);
ParcelProcessingState.byVal.set(ParcelProcessingState.GOT_RESYNCED_STATE.val, ParcelProcessingState.GOT_RESYNCED_STATE);
ParcelProcessingState.byVal.set(ParcelProcessingState.PAYMENT_POLLING.val, ParcelProcessingState.PAYMENT_POLLING);
ParcelProcessingState.byVal.set(ParcelProcessingState.PAYLOAD_POLLING.val, ParcelProcessingState.PAYLOAD_POLLING);
ParcelProcessingState.byVal.set(ParcelProcessingState.GOT_CONSENSUS.val, ParcelProcessingState.GOT_CONSENSUS);
ParcelProcessingState.byVal.set(ParcelProcessingState.SENDING_CONSENSUS.val, ParcelProcessingState.SENDING_CONSENSUS);
ParcelProcessingState.byVal.set(ParcelProcessingState.FINISHED.val, ParcelProcessingState.FINISHED);
ParcelProcessingState.byVal.set(ParcelProcessingState.EMERGENCY_BREAK.val, ParcelProcessingState.EMERGENCY_BREAK);

/**
 * Processor for parcel that should be processed.
 *
 * Parcel's processor download parcel or get it from constructor params;
 * then run {@link Node#checkItemInternal(HashId, HashId, Approvable, boolean, boolean, boolean)} for both
 * payment and payload items, but with isCheckingForce param set to false for payload: payload checking wait
 * for payment item will be processed (goes through {@link ParcelProcessingState#PREPARING},
 * {@link ParcelProcessingState#PAYMENT_CHECKING}, {@link ParcelProcessingState#PAYMENT_POLLING} processing states);
 * after payment have been processed payload is start checking (goes through
 * {@link ParcelProcessingState#PAYLOAD_CHECKING}, {@link ParcelProcessingState#PAYLOAD_POLLING}); finally
 * parcel's processor removing (goes through  {@link ParcelProcessingState#FINISHED},
 * {@link ParcelProcessingState#NOT_EXIST} processing states).
 *
 * @param parcelId is parcel's id to processing
 * @param parcel is {@link Parcel} if exists. Will download if not exists.
 * @param node
 */
class ParcelProcessor {

    constructor(parcelId, parcel, mutex, node) {
        this.parcelId = parcelId;
        this.mutex = mutex;
        this.node = node;

        this.paymentResult = null;
        this.payloadResult = null;

        if (parcel == null)
            this.parcel = this.node.parcelCache.get(parcelId);
        else
            this.parcel = parcel;

        if (this.parcel != null) {
            this.payment = parcel.getPaymentContract();
            this.payload = parcel.getPayloadContract();
        }

        this.sources = new t.GenericSet();

        this.paymentDelayedVotes = new t.GenericMap();
        this.payloadDelayedVotes = new t.GenericMap();

        this.processingState = ParcelProcessingState.INIT;

        this.doneEvent = new AsyncEvent(this.node.executorService);

        this.downloader = null;
        this.processSchedule = null;
    }

    async run() {
        this.node.report("parcel processor for: " + this.parcelId + " created", VerboseLevel.BASE);

        if (this.parcel != null)
            new ScheduleExecutor(async () => await this.parcelDownloaded(), 0, this.node.executorService).run();

        return this;
    }

    //******************** processing section ********************//

    pulseProcessing() {
        this.node.report("parcel processor for: " + this.parcelId + " :: pulseProcessing, state " + this.processingState,
            VerboseLevel.BASE);

        if(this.processingState.canContinue) {
            if (this.processSchedule == null || this.processSchedule.isDone)
                new ScheduleExecutor(async () => await this.process(), 0, this.node.executorService).run();
        }
    }

    /**
     * Main process of processor. Here processor wait until payment will checked and approved.
     * Then wait decision about payload contract.
     */
    async process() {
        this.node.report("parcel processor for: " +
            this.parcelId + " :: process, payment " +
            this.payment.id + ", payload " +
            this.payload.id + ", state " + this.processingState,
            VerboseLevel.BASE);

        if(!this.processingState.canContinue)
            return;

        this.processingState = ParcelProcessingState.PREPARING;

        try {
            this.node.report("parcel processor for: " +
                this.parcelId + " :: check payment, state " + this.processingState,
                VerboseLevel.BASE);

            // wait payment
            if (this.paymentResult == null) {
                this.processingState = ParcelProcessingState.PAYMENT_CHECKING;

                for (let ni of this.paymentDelayedVotes.keys())
                await this.paymentProcessor.vote(ni, this.paymentDelayedVotes.get(ni));
                this.paymentDelayedVotes.clear();

                this.processingState = ParcelProcessingState.PAYMENT_POLLING;
                if(!this.paymentProcessor.isDone) {
                    await this.paymentProcessor.doneEvent.await();
                }
                this.paymentResult = this.paymentProcessor.getResult();
            }

            this.node.report("parcel processor for: " +
                this.parcelId + " :: payment checked, state " + this.processingState,
                VerboseLevel.BASE);

            // if payment is ok, wait payload
            if (this.paymentResult.state.isApproved) {
                if(!this.payment.limitedForTestnet)
                    await this.node.ledger.savePayment(this.parcel.quantasLimit / Quantiser.quantaPerU,
                        this.paymentProcessor != null ? this.paymentProcessor.record.getCreatedAt() : await this.node.ledger.getRecord(this.payment.id).getCreatedAt());

                this.node.report("parcel processor for: " +
                    this.parcelId + " :: check payload, state " + this.processingState,
                    VerboseLevel.BASE);


                if (this.payment.getOrigin().equals(this.payload.getOrigin())) {
                    this.payload.errors.push(new ErrorRecord(Errors.BADSTATE, this.payload.id.toString(), "can't register contract with same origin as payment contract "));

                    await this.payloadProcessor.emergencyBreak();
                    await this.payloadProcessor.doneEvent.await();
                } else {
                    if (this.payloadResult == null) {

                        this.processingState = ParcelProcessingState.PAYLOAD_CHECKING;

                        this.payload.quantiser.reset(this.parcel.quantasLimit);

                        // force payload checking (we've freeze it at processor start)
                        this.payloadProcessor.forceChecking(true);

                        for (let ni of this.payloadDelayedVotes.keys())
                        await this.payloadProcessor.vote(ni, this.payloadDelayedVotes.get(ni));
                        this.payloadDelayedVotes.clear();

                        this.processingState = ParcelProcessingState.PAYLOAD_POLLING;
                        if (!this.payloadProcessor.isDone) {
                            await this.payloadProcessor.doneEvent.await();
                        }
                        this.payloadResult = this.payloadProcessor.getResult();
                    }

                    if ((this.payloadResult != null) && this.payloadResult.state.isApproved)
                        if(!this.payload.limitedForTestnet) {
                            let paidU = t.getOrDefault(this.payload.state.data, NSmartContract.PAID_U_FIELD_NAME, 0);
                            if (paidU > 0)
                                await this.node.ledger.savePayment(paidU,
                                    this.payloadProcessor != null ? this.payloadProcessor.record.getCreatedAt() : await this.node.ledger.getRecord(this.payload.id).getCreatedAt());
                        }
                }
                this.node.report("parcel processor for: " +
                    this.parcelId + " :: payload checked, state " + this.processingState,
                    VerboseLevel.BASE);

            } else {
                this.node.report("parcel processor for: " +
                    this.parcelId + " :: payment was not approved: " + this.paymentResult.state +
                    ", state " + this.processingState,
                    VerboseLevel.BASE);

                if(this.payloadProcessor != null) {
                    await this.payloadProcessor.emergencyBreak();
                    await this.payloadProcessor.doneEvent.await();
                }
            }

            // we got payment and payload result, can fire done event for waiters
            this.processingState = ParcelProcessingState.FINISHED;

            this.node.report("parcel processor for: " +
                this.parcelId + " :: processing finished, state " + this.processingState,
                VerboseLevel.BASE);

            this.doneEvent.fire();

            // but we want to wait until paymentProcessor and payloadProcessor will be removed
            if(this.paymentProcessor != null && this.paymentProcessor.processingState !== ItemProcessingState.FINISHED) {
                await this.paymentProcessor.removedEvent.await();
            }
            if(this.payloadProcessor != null && this.payloadProcessor.processingState !== ItemProcessingState.FINISHED) {
                await this.payloadProcessor.removedEvent.await();
            }
        } catch (err) {
                this.node.logger.log(err.stack);
                this.node.logger.log("process ERROR: " + err.message);

                this.processingState = ParcelProcessingState.FINISHED;
                this.doneEvent.fire();
        }
        this.removeSelf();
    }

    stopProcesser() {
        if (this.processSchedule != null) {
            this.processSchedule.cancel(true);
            this.processSchedule = null;
        }
    }

    //******************** download section ********************//

    pulseDownload() {
        if(!this.processingState.canContinue || this.processingState.isProcessedToConsensus)
            return;

        this.processingState = ParcelProcessingState.DOWNLOADING;

        if (this.parcel == null && (this.downloader == null || this.downloader.isDone)) {
            this.downloader = new ScheduleExecutor(async () => await this.download(), 0, this.node.executorService).run();
        }
    }

    async download() {
        if (this.processingState.canContinue) {
            let retryCounter = Config.getItemRetryCount;
            while (!this.isPayloadPollingExpired() && this.parcel == null) {
                if (this.sources.size === 0) {
                    //this.node.logger.log("empty sources for download tasks, stopping");
                    break;
                } else {
                    try {
                        // first we have to wait for sources
                        let source = Array.from(this.sources)[Math.floor(Math.random() * this.sources.size)];

                        this.parcel = await this.node.network.getParcel(this.parcelId, source, Config.maxGetItemTime);
                        if (this.parcel != null) {
                            await this.parcelDownloaded();
                            break;
                        } else {
                            await sleep(1000);
                            retryCounter -= 1;
                        }

                    } catch (err) {
                        this.node.logger.log(err.stack);
                        this.node.logger.log("download ERROR: " + err.message);
                    }
                }
                if (retryCounter <= 0)
                    return;
            }
        }

        this.downloader = null;
    }
    async parcelDownloaded() {

        this.node.report("parcel processor for: " +
            this.parcelId + " :: parcelDownloaded, state " + this.processingState,
            VerboseLevel.BASE);

        if(!this.processingState.canContinue)
            return;

        this.node.parcelCache.put(this.parcel);

        this.payment = this.parcel.getPaymentContract();
        this.payload = this.parcel.getPayloadContract();

        // create item processors or get results for payment and payload

        await this.node.lock.synchronize(this.mutex, async () => {

            this.payment.quantiser.reset(Config.paymentQuantaLimit);

            let x = await this.node.checkItemInternal(this.payment.id, this.parcelId, this.payment, true, true);
            if (x instanceof ItemProcessor) {
                this.paymentProcessor = x;

                this.node.report("parcel processor for: " +
                    this.parcelId + " :: payment is processing, item processing state: " +
                    this.paymentProcessor.processingState + ", parcel processing state " + this.processingState +
                    ", item state ", this.paymentProcessor.record.state,
                    VerboseLevel.BASE);

                // if current item processor for payment was inited by another parcel we should decline this payment
                if(!this.parcelId.equals(this.paymentProcessor.parcelId)) {
                    this.paymentResult = ItemResult.UNDEFINED;
                }
            } else {
                this.paymentResult = x;

                this.node.report("parcel processor for: " +
                    this.parcelId + " :: payment already processed, parcel processing state " +
                    this.processingState +
                    ", item state ", this.paymentResult.state,
                    VerboseLevel.BASE);

                // if ledger already have approved state for payment it means onw of two:
                // 1. payment was already processed and cannot be used as payment for current parcel
                // 2. payment having been processing but this node starts too old and consensus already got.
                // So, in both ways we can answer undefined
                if (this.paymentResult.state === ItemState.APPROVED) {
                    this.paymentResult = ItemResult.UNDEFINED;
                }
            }
            // we freeze payload checking until payment will be approved
            x = await this.node.checkItemInternal(this.payload.id, this.parcelId, this.payload, true, false);
            if (x instanceof ItemProcessor) {
                this.payloadProcessor = x;

                this.node.report("parcel processor for: " +
                    this.parcelId + " :: payload is processing, item processing state: " +
                    this.payloadProcessor.processingState + ", parcel processing state " + this.processingState +
                    ", item state " + this.payloadProcessor.record.state,
                    VerboseLevel.BASE);
            } else {
                this.payloadResult = x;

                this.node.report("parcel processor for: " +
                    this.parcelId, " :: payload already processed, parcel processing state " +
                    this.processingState +
                    ", item state ", this.payloadResult.state +
                    VerboseLevel.BASE);
            }
        });

        this.pulseProcessing();
        this.downloadedEvent.fire();
    }

    stopDownloader() {
        if (this.downloader != null) {
            this.downloader.cancel(true);
            this.downloader = null;
        }
    }

    //******************** polling section ********************//

    async vote(node, state, isU) {
        if(!this.processingState.canContinue)
            return;

        // if we got vote but item processor not exist yet - we store that vote.
        // Otherwise we give vote to item processor
        if(isU){
            if (this.paymentProcessor != null) {
                await this.paymentProcessor.vote(node, state);
            } else {
                this.paymentDelayedVotes.set(node, state);
            }
        } else {
            if (this.payloadProcessor != null) {
                await this.payloadProcessor.vote(node, state);
            } else {
                this.payloadDelayedVotes.set(node, state);
            }
        }

    }

    //******************** common section ********************//

     getPayloadResult() {
        if(this.payloadResult != null)
            return this.payloadResult;
        if(this.payloadProcessor != null)
            return this.payloadProcessor.getResult();
        return ItemResult.UNDEFINED;
    }

    getPayloadState() {
        if(this.payloadResult != null)
            return this.payloadResult.state;
        if(this.payloadProcessor != null)
            return this.payloadProcessor.record.state;
        return ItemState.PENDING;
    }

    getPaymentResult() {
        if(this.paymentResult != null)
            return this.paymentResult;
        if(this.paymentProcessor != null)
            return this.paymentProcessor.getResult();
        return ItemResult.UNDEFINED;
    }

    getPaymentState() {
        if(this.paymentResult != null)
            return this.paymentResult.state;
        if(this.paymentProcessor != null)
            return this.paymentProcessor.record.state;
        return ItemState.PENDING;
    }

    getPaymentProcessingState() {
        if(this.paymentProcessor != null)
            return this.paymentProcessor.processingState;
        return ItemProcessingState.NOT_EXIST;
    }

    getPayloadProcessingState() {
        if(this.payloadProcessor != null)
            return this.payloadProcessor.processingState;
        return ItemProcessingState.NOT_EXIST;
    }

    /**
     * True if we need to get payload vote from a node
     *
     * @param node we might need vote from
     * @return
     */
    needsPayloadVoteFrom(node) {
        if(this.payloadProcessor != null)
            return this.payloadProcessor.needsVoteFrom(node);
        return false;
    }

    /**
     * True if we need to get payment vote from a node
     *
     * @param node we might need vote from
     * @return
     */
    needsPaymentVoteFrom(node) {
        if(this.paymentProcessor != null)
            return this.paymentProcessor.needsVoteFrom(node);
        return false;
    }

    addToSources(node) {
        if (this.parcel != null)
            return;

        if (this.sources.add(node)) {
            this.pulseDownload();
        }
    }

    /**
     * Remove parcel processor from the Node and stop all processes.
     */
    removeSelf() {
        this.node.report("parcel processor for: " +
            this.parcelId + " :: removeSelf, state " + this.processingState,
            VerboseLevel.BASE);

        if(this.processingState.canRemoveSelf) {
            this.node.parcelProcessors.remove(this.parcelId);

            this.stopDownloader();
            this.stopProcesser();

            this.doneEvent.fire();
        }
    }

    isPayloadPollingExpired() {
        if(this.payloadProcessor != null)
            return this.payloadProcessor.isPollingExpired();
        return false;
    }

    isDone() {
        return this.processingState === ParcelProcessingState.FINISHED;
    }

}

module.exports = {ParcelProcessor, ParcelProcessingState};