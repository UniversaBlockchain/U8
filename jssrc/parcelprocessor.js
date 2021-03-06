/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {ScheduleExecutor, AsyncEvent} from "executorservice";
import {ItemProcessor, ItemProcessingState} from "itemprocessor";
import {VerboseLevel} from "node_consts";
import {Errors, ErrorRecord} from "errors";

const Quantiser = require("quantiser").Quantiser;
const Config = require("config").Config;
const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const NSmartContract = require("services/NSmartContract").NSmartContract;

const ParcelProcessingState = require("parcelprocessor_state").ParcelProcessingState;

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

    constructor(parcelId, parcel, node) {
        this.parcelId = parcelId;
        this.node = node;

        this.paymentResult = null;
        this.payloadResult = null;

        if (parcel == null)
            this.parcel = this.node.parcelCache.get(parcelId);
        else
            this.parcel = parcel;

        if (this.parcel != null) {
            this.payment = this.parcel.getPaymentContract();
            this.payload = this.parcel.getPayloadContract();
        }

        this.sources = new t.GenericSet();

        this.paymentDelayedVotes = new t.GenericMap();
        this.payloadDelayedVotes = new t.GenericMap();

        this.processingState = ParcelProcessingState.INIT;

        this.doneEvent = new AsyncEvent(this.node.executorService);
        this.waitPayloadEvent = new AsyncEvent(this.node.executorService);
        this.finishEvent = new AsyncEvent(this.node.executorService);

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
        this.node.report("parcel processor for: " + this.parcelId + " :: pulseProcessing, state " +
            this.processingState.val, VerboseLevel.BASE);

        if (this.processingState.canContinue && this.processSchedule == null) {
            this.processSchedule = new ScheduleExecutor(async () => await this.process(), 0, this.node.executorService);
            this.processSchedule.run();
        }
    }

    /**
     * Main process of processor. Here processor wait until payment will checked and approved.
     * Then wait decision about payload contract.
     */
    async process() {
        if (this.processSchedule == null)
            return;

        this.node.report("parcel processor for: " +
            this.parcelId + " :: process, payment " +
            this.payment.id + ", payload " +
            this.payload.id + ", state " + this.processingState.val,
            VerboseLevel.BASE);

        if (!this.processingState.canContinue) {
            this.processSchedule = null;
            return;
        }

        this.processingState = ParcelProcessingState.PREPARING;

        try {
            this.node.report("parcel processor for: " + this.parcelId + " :: check payment, state " +
                this.processingState.val, VerboseLevel.BASE);

            // process payment
            this.processingState = ParcelProcessingState.PAYMENT_CHECKING;

            for (let ni of this.paymentDelayedVotes.keys())
                this.paymentProcessor.vote(ni, this.paymentDelayedVotes.get(ni));

            this.paymentDelayedVotes.clear();

            this.processingState = ParcelProcessingState.PAYMENT_POLLING;

            try {
                await this.paymentProcessor.itemCommitEvent.await(this.node.config.maxWaitingItemOfParcel * 1000);
            } catch (err) {
                this.paymentProcessor.emergencyBreak();
                await this.paymentProcessor.itemCommitEvent.await();
            }

            this.node.report("parcel processor for: " + this.parcelId + " :: payment checked, state " +
                this.processingState.val, VerboseLevel.BASE);

            // if payment is ok, process payload
            if (this.paymentProcessor.itemCommitEvent.result.success) {
                this.node.report("parcel processor for: " + this.parcelId + " :: check payload, state " +
                    this.processingState.val, VerboseLevel.BASE);

                if (this.payment.getOrigin().equals(this.payload.getOrigin())) {
                    this.payload.errors.push(new ErrorRecord(Errors.BADSTATE, this.payload.id.toString(),
                        "can't register contract with same origin as payment contract"));

                    this.payloadProcessor.emergencyBreak();

                } else {
                    this.processingState = ParcelProcessingState.PAYLOAD_CHECKING;

                    this.payload.quantiser.reset(this.parcel.quantasLimit);

                    // force payload checking (we've freeze it at processor start)
                    this.payloadProcessor.forceChecking(true);

                    for (let ni of this.payloadDelayedVotes.keys())
                        this.payloadProcessor.vote(ni, this.payloadDelayedVotes.get(ni));

                    this.payloadDelayedVotes.clear();

                    this.processingState = ParcelProcessingState.PAYLOAD_POLLING;
                }

                try {
                    await this.payloadProcessor.itemCommitEvent.await(this.node.config.maxWaitingItemOfParcel * 1000);
                } catch (err) {
                    this.node.report("parcel processor for: " + this.parcelId + " :: payload voting has been expired, state " +
                        this.processingState.val, VerboseLevel.BASE);

                    this.paymentProcessor.parcelCommitEvent.fire(false);

                    this.paymentProcessor.itemCommitEvent = new AsyncEvent(this.node.executorService);
                    this.payloadProcessor.itemCommitEvent = new AsyncEvent(this.node.executorService);
                    this.paymentProcessor.parcelCommitEvent = new AsyncEvent(this.node.executorService);

                    this.paymentProcessor.item.errors.push(new ErrorRecord
                        (Errors.FAILURE, this.paymentProcessor.itemId.toString(), "payload voting has been expired"));

                    this.paymentProcessor.rollback(true);
                    await this.paymentProcessor.itemCommitEvent.await();

                    this.payloadProcessor.emergencyBreak();
                    await this.payloadProcessor.itemCommitEvent.await();
                }

                this.node.report("parcel processor for: " + this.parcelId + " :: payload checked, state " +
                    this.processingState.val, VerboseLevel.BASE);

            } else {
                this.node.report("parcel processor for: " + this.parcelId + " :: payment was not approved, state "
                    + this.processingState.val, VerboseLevel.BASE);

                this.payloadProcessor.emergencyBreak();
                await this.payloadProcessor.itemCommitEvent.await();
            }

            // common commit
            this.node.report("parcel processor for: " + this.parcelId + " :: common commit, state " +
                this.processingState.val, VerboseLevel.BASE);

            try {
                await this.node.ledger.transaction(async (con) => {
                    await this.paymentProcessor.itemCommitEvent.result.block(con);
                    await this.payloadProcessor.itemCommitEvent.result.block(con);

                    this.paymentProcessor.parcelCommitEvent.fire(true);
                    this.payloadProcessor.parcelCommitEvent.fire(true);
                });
            } catch (err) {
                this.paymentProcessor.parcelCommitEvent.fire(false);
                this.payloadProcessor.parcelCommitEvent.fire(false);

                throw err;
            }

            this.node.report("parcel processor for: " + this.parcelId + " :: wait payment result, state " +
                this.processingState.val, VerboseLevel.BASE);

            if (this.paymentResult == null) {
                if (!this.paymentProcessor.isDone())
                    await this.paymentProcessor.doneEvent.await();

                this.paymentResult = this.paymentProcessor.getResult();
            }

            this.node.report("parcel processor for: " + this.parcelId + " :: wait payload result, state " +
                this.processingState.val, VerboseLevel.BASE);

            if (this.payloadResult == null) {
                if (!this.payloadProcessor.isDone())
                    await this.payloadProcessor.doneEvent.await();

                this.payloadResult = this.payloadProcessor.getResult();
            }

            // save payments
            if (this.paymentResult != null && this.paymentResult.state.isApproved)
                if (!this.payment.limitedForTestnet)
                    await this.node.ledger.savePayment(this.parcel.quantasLimit / Quantiser.quantaPerU,
                        this.paymentProcessor != null ? this.paymentProcessor.record.createdAt :
                        await this.node.ledger.getRecord(this.payment.id).createdAt);

            if (this.payloadResult != null && this.payloadResult.state.isApproved)
                if (!this.payload.limitedForTestnet) {
                    let paidU = t.getOrDefault(this.payload.state.data, NSmartContract.PAID_U_FIELD_NAME, 0);
                    if (paidU > 0)
                        await this.node.ledger.savePayment(paidU,
                            this.payloadProcessor != null ? this.payloadProcessor.record.createdAt :
                                await this.node.ledger.getRecord(this.payload.id).createdAt);
                }

            // we got payment and payload result, can fire done event for waiters
            this.processingState = ParcelProcessingState.FINISHED;

            this.node.report("parcel processor for: " + this.parcelId + " :: processing finished, state " +
                this.processingState.val, VerboseLevel.BASE);

            this.doneEvent.fire();

            // but we want to wait until paymentProcessor and payloadProcessor will be removed
            if (this.paymentProcessor != null && this.paymentProcessor.processingState !== ItemProcessingState.FINISHED)
                await this.paymentProcessor.removedEvent;

            if (this.payloadProcessor != null && this.payloadProcessor.processingState !== ItemProcessingState.FINISHED)
                await this.payloadProcessor.removedEvent;

        } catch (err) {
            this.node.logger.log(err.stack);
            this.node.logger.log("process ERROR: " + err.message);

            this.processingState = ParcelProcessingState.FINISHED;
            this.doneEvent.fire();
        }

        this.removeSelf();

        this.processSchedule = null;
    }

    stopProcessor() {
        if (this.processSchedule != null) {
            this.processSchedule.cancel();
            this.processSchedule = null;
        }
    }

    //******************** download section ********************//

    pulseDownload() {
        if (this.processingState.canContinue || !this.processingState.isProcessedToConsensus) {
            this.processingState = ParcelProcessingState.DOWNLOADING;

            if (this.parcel == null && this.downloader == null) {
                this.downloader = new ScheduleExecutor(async () => await this.download(), 0, this.node.executorService);
                this.downloader.run();
            }
        }
    }

    async download() {
        if (this.downloader == null)
            return;

        if (!this.processingState.canContinue) {
            this.downloader = null;
            return;
        }

        let retryCounter = Config.itemGetRetryCount;
        while (!this.isPayloadPollingExpired() && this.parcel == null) {
            if (this.sources.size === 0) {
                //this.node.logger.log("empty sources for download tasks, stopping");
                break;
            } else {
                try {
                    // first we have to wait for sources
                    let source = Array.from(this.sources)[Math.floor(Math.random() * this.sources.size)];

                    this.parcel = await this.node.network.getParcel(this.parcelId, source, Config.maxGetItemTime * 1000);
                    if (this.parcel != null) {
                        await this.parcelDownloaded();
                        this.downloader = null;
                        return;
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
                break;
        }

        this.downloader = null;
    }

    async parcelDownloaded() {

        this.node.report("parcel processor for: " + this.parcelId + " :: parcelDownloaded, state " +
            this.processingState.val, VerboseLevel.BASE);

        if (!this.processingState.canContinue)
            return;

        this.node.parcelCache.put(this.parcel);

        this.payment = this.parcel.getPaymentContract();
        this.payload = this.parcel.getPayloadContract();

        // create item processors or get results for payment and payload
        await this.node.lock.synchronize(this.parcelId, async () => {

            this.payment.quantiser.reset(Config.paymentQuantaLimit);

            let x = await this.node.checkItemInternal(this.payment.id, this.parcelId, this.payment, true, true, false, this, true);
            if (x instanceof ItemProcessor) {
                this.paymentProcessor = x;

                this.node.report("parcel processor for: " + this.parcelId +
                    " :: payment is processing, item processing state: " + this.paymentProcessor.processingState.val +
                    ", parcel processing state " + this.processingState.val + ", item state " +
                    this.paymentProcessor.record.state.val, VerboseLevel.BASE);

                // if current item processor for payment was inited by another parcel we should decline this payment
                if (!this.parcelId.equals(this.paymentProcessor.parcelId))
                    this.paymentResult = ItemResult.UNDEFINED;

            } else {
                this.paymentResult = x;

                this.node.report("parcel processor for: " + this.parcelId +
                    " :: payment already processed, parcel processing state " + this.processingState.val + ", item state " +
                    this.paymentResult.state.val, VerboseLevel.BASE);

                // if ledger already have approved state for payment it means onw of two:
                // 1. payment was already processed and cannot be used as payment for current parcel
                // 2. payment having been processing but this node starts too old and consensus already got.
                // So, in both ways we can answer undefined
                if (this.paymentResult.state === ItemState.APPROVED)
                    this.paymentResult = ItemResult.UNDEFINED;
            }
            // we freeze payload checking until payment will be approved
            x = await this.node.checkItemInternal(this.payload.id, this.parcelId, this.payload, true, false, false, this, false);
            if (x instanceof ItemProcessor) {
                this.payloadProcessor = x;

                this.node.report("parcel processor for: " + this.parcelId +
                    " :: payload is processing, item processing state: " + this.payloadProcessor.processingState.val +
                    ", parcel processing state " + this.processingState.val + ", item state " +
                    this.payloadProcessor.record.state.val, VerboseLevel.BASE);
            } else {
                this.payloadResult = x;

                this.node.report("parcel processor for: " + this.parcelId,
                    " :: payload already processed, parcel processing state " + this.processingState.val + ", item state " +
                    this.payloadResult.state.val, VerboseLevel.BASE);
            }
        });

        this.pulseProcessing();
    }

    stopDownloader() {
        if (this.downloader != null) {
            this.downloader.cancel();
            this.downloader = null;
        }
    }

    //******************** polling section ********************//

    vote(node, state, isU) {
        if (!this.processingState.canContinue)
            return;

        // if we got vote but item processor not exist yet - we store that vote.
        // Otherwise we give vote to item processor
        if (isU) {
            if (this.paymentProcessor != null)
                this.paymentProcessor.vote(node, state);
            else
                this.paymentDelayedVotes.set(node, state);

        } else {
            if (this.payloadProcessor != null)
                this.payloadProcessor.vote(node, state);
            else
                this.payloadDelayedVotes.set(node, state);
        }
    }

    //******************** common section ********************//

     getPayloadResult() {
        if (this.payloadResult != null)
            return this.payloadResult;
        if (this.payloadProcessor != null)
            return this.payloadProcessor.getResult();
        return ItemResult.UNDEFINED;
    }

    getPayloadState() {
        if (this.payloadResult != null)
            return this.payloadResult.state;
        if (this.payloadProcessor != null)
            return this.payloadProcessor.record.state;
        return ItemState.PENDING;
    }

    getPaymentResult() {
        if (this.paymentResult != null)
            return this.paymentResult;
        if (this.paymentProcessor != null)
            return this.paymentProcessor.getResult();
        return ItemResult.UNDEFINED;
    }

    getPaymentState() {
        if (this.paymentResult != null)
            return this.paymentResult.state;
        if (this.paymentProcessor != null)
            return this.paymentProcessor.record.state;
        return ItemState.PENDING;
    }

    /**
     * Returns true if we need to get payload vote from a node.
     *
     * @param {network.NodeInfo} node we might need vote from.
     * @return {boolean} true if we need to get payload vote from a node.
     */
    needsPayloadVoteFrom(node) {
        if (this.payloadProcessor != null)
            return this.payloadProcessor.needsVoteFrom(node);
        return false;
    }

    /**
     * Returns true if we need to get payment vote from a node.
     *
     * @param {network.NodeInfo} node we might need vote from.
     * @return {boolean} true if we need to get payment vote from a node.
     */
    needsPaymentVoteFrom(node) {
        if (this.paymentProcessor != null)
            return this.paymentProcessor.needsVoteFrom(node);
        return false;
    }

    addToSources(node) {
        if (this.parcel != null)
            return;

        let has = this.sources.has(node);

        this.sources.add(node);
        if (!has)
            this.pulseDownload();
    }

    /**
     * Remove parcel processor from the Node and stop all processes.
     */
    removeSelf() {
        this.node.report("parcel processor for: " + this.parcelId + " :: removeSelf, state " + this.processingState.val,
            VerboseLevel.BASE);

        if (this.processingState.canRemoveSelf) {
            this.node.parcelProcessors.delete(this.parcelId);

            this.stopDownloader();
            this.stopProcessor();

            this.doneEvent.fire();
        }
    }

    isPayloadPollingExpired() {
        if (this.payloadProcessor != null)
            return this.payloadProcessor.isPollingExpired();
        return false;
    }

    isDone() {
        return this.processingState === ParcelProcessingState.FINISHED;
    }

}

module.exports = {ParcelProcessor, ParcelProcessingState};