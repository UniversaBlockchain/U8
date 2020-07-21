/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const FollowerCallbackState = {
    UNDEFINED : {val:"UNDEFINED", ordinal:0},
    STARTED : {val:"STARTED", ordinal:1},
    EXPIRED : {val:"EXPIRED", ordinal:2},    // not commited failed
    COMPLETED : {val:"COMPLETED", ordinal:3},
    FAILED : {val:"FAILED", ordinal:4}
};

FollowerCallbackState.byOrdinal = new Map();
FollowerCallbackState.byOrdinal.set(FollowerCallbackState.UNDEFINED.ordinal, FollowerCallbackState.UNDEFINED);
FollowerCallbackState.byOrdinal.set(FollowerCallbackState.STARTED.ordinal, FollowerCallbackState.STARTED);
FollowerCallbackState.byOrdinal.set(FollowerCallbackState.EXPIRED.ordinal, FollowerCallbackState.EXPIRED);
FollowerCallbackState.byOrdinal.set(FollowerCallbackState.COMPLETED.ordinal, FollowerCallbackState.COMPLETED);
FollowerCallbackState.byOrdinal.set(FollowerCallbackState.FAILED.ordinal, FollowerCallbackState.FAILED);

module.exports = {FollowerCallbackState};