/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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

module.exports = {ParcelProcessingState};
