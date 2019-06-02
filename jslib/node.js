
const VerboseLevel = {
    NOTHING: 0,
    BASE: 1,
    DETAILED: 2
};

const ResyncingItemProcessingState = {
    WAIT_FOR_VOTES,
    PENDING_TO_COMMIT,
    IS_COMMITTING,
    COMMIT_SUCCESSFUL,
    COMMIT_FAILED
};

module.exports = {VerboseLevel};