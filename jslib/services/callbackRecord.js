/**
 * Callback record for synchronize state of expired callbacks.
 * Callback records are subject to synchronization if callback state == STARTED or EXPIRED and time to send callback expired.
 * To synchronize the callback, it is necessary that more than half of the Universa network nodes confirm the status
 * of the callback (COMPLETED or FAILED). To synchronize the callback was considered impossible it is necessary that 80%
 * network nodes (excluding the node performing synchronization) respond, but the state of the callback cannot be synchronized.
 */
class CallbackRecord {

    /**
     * Create callback record.
     *
     * @param {crypto.HashId} id is callback identifier
     * @param {number} environmentId is environment subscription
     * @param {NCallbackService.FollowerCallbackState} state is callback state
     */
    constructor(id, environmentId, state) {
        this.id = id;
        this.environmentId = environmentId;
        this.state = state;
        this.expiresAt = null;

        // synchronization counters
        this.completedNodes = 0;
        this.failedNodes = 0;
        this.allNodes = 0;

        // consensus for synchronization state and limit for end synchronization
        this.consensus = 1;
        this.limit = 1;
    }
}

module.exports = {CallbackRecord};