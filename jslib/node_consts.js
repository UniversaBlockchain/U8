/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const VerboseLevel = {
    NOTHING: 0,
    BASE: 1,
    DETAILED: 2
};

const ResyncingItemProcessingState = {
    WAIT_FOR_VOTES: {val: "WAIT_FOR_VOTES"},
    PENDING_TO_COMMIT: {val: "PENDING_TO_COMMIT"},
    IS_COMMITTING: {val: "IS_COMMITTING"},
    COMMIT_SUCCESSFUL: {val: "COMMIT_SUCCESSFUL"},
    COMMIT_FAILED: {val: "COMMIT_FAILED"}
};

module.exports = {VerboseLevel, ResyncingItemProcessingState};