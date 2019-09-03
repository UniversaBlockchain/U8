/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const t = require("tools");

const UBotPoolState = {

    /**
     * UBot creates new CloudProcessor with this state if it has received UBotCloudNotification, but CloudProcessor
     * with corresponding poolId not found. Then UBot calls method onNotifyInit for new CloudProcessor.
     */
    INIT                                       : {val: "INIT", canContinue: true, ordinal: 0},

    /**
     * At this state CloudProcessor should select ubots for new pool,
     * and periodically send to them udp notifications with invite to download startingContract.
     * Meanwhile, CloudProcessor is waiting for other ubots in pool to downloads startingContract.
     */
    SEND_STARTING_CONTRACT                     : {val: "SEND_STARTING_CONTRACT", canContinue: true, ordinal: 1},

    /**
     * CloudProcessor is downloading startingContract from pool starter ubot.
     */
    DOWNLOAD_STARTING_CONTRACT                 : {val: "DOWNLOAD_STARTING_CONTRACT", canContinue: true, ordinal: 2},

    /**
     * CloudProcessor is executing cloud method.
     */
    START_EXEC                                 : {val: "START_EXEC", canContinue: true, ordinal: 3},

    /**
     * CloudProcessor is finished.
     */
    FINISHED                                   : {val: "FINISHED", canContinue: false, ordinal: 4, nextStates: []},

    /**
     * CloudProcessor is failed.
     */
    FAILED                                     : {val: "FAILED", canContinue: false, ordinal: 5, nextStates: []}
};

/**
 * CloudProcessor available next states
 */
UBotPoolState.INIT.nextStates = [
    UBotPoolState.SEND_STARTING_CONTRACT.ordinal,
    UBotPoolState.DOWNLOAD_STARTING_CONTRACT.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.SEND_STARTING_CONTRACT.nextStates = [
    UBotPoolState.START_EXEC.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.DOWNLOAD_STARTING_CONTRACT.nextStates = [
    UBotPoolState.START_EXEC.ordinal,
    UBotPoolState.FAILED.ordinal,
];

UBotPoolState.START_EXEC.nextStates = [
    UBotPoolState.FINISHED.ordinal,
    UBotPoolState.FAILED.ordinal,
];

t.addValAndOrdinalMaps(UBotPoolState);

module.exports = {UBotPoolState};