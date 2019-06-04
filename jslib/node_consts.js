const VerboseLevel = {
    NOTHING: 0,
    BASE: 1,
    DETAILED: 2
};

const ResyncingItemProcessingState = {
    WAIT_FOR_VOTES: 0,
    PENDING_TO_COMMIT: 1,
    IS_COMMITTING: 2,
    COMMIT_SUCCESSFUL: 3,
    COMMIT_FAILED: 4
};

module.exports = {VerboseLevel, ResyncingItemProcessingState};