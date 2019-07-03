const NCallbackService = require("services/callbackService").NCallbackService;
const events = require("services/contractSubscription");

// array indexes for atomic synchronization counters
const completedNodes = 0;
const failedNodes = 1;
const allNodes = 2;

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
     * @param {crypto.HashId} id - Callback identifier.
     * @param {number} environmentId - Environment subscription.
     * @param {FollowerCallbackState} state - Callback state.
     */
    constructor(id, environmentId, state) {
        this.id = id;
        this.environmentId = environmentId;
        this.state = state;
        this.expiresAt = null;

        // atomic synchronization counters
        this.nodesCounters = new Uint32Array(3);

        // consensus for synchronization state and limit for end synchronization
        this.consensus = 1;
        this.limit = 1;
    }

    /**
     * Save callback record to ledger for possible synchronization.
     *
     * @param {crypto.HashId} id - Callback identifier.
     * @param {number} environmentId - Environment identifier.
     * @param {Config} config - Node configuration.
     * @param {number} networkNodesCount - Count of nodes in Universa network.
     * @param {Ledger} ledger - Node ledger.
     */
    static async addCallbackRecordToLedger(id, environmentId, config, networkNodesCount, ledger) {
        let expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + config.followerCallbackExpiration + config.followerCallbackDelay * (networkNodesCount + 3));
        let storedUntil = new Date();
        storedUntil.setSeconds(storedUntil.getSeconds() + config.followerCallbackStateStoreTime);

        await ledger.addFollowerCallback(id, environmentId, expiresAt, storedUntil);
    }

    incrementCompletedNodes() {
        Atomics.add(this.nodesCounters, allNodes, 1);
        return Atomics.add(this.nodesCounters, completedNodes, 1) + 1;
    }

    incrementFailedNodes() {
        Atomics.add(this.nodesCounters, allNodes, 1);
        return Atomics.add(this.nodesCounters, failedNodes, 1) + 1;
    }

    incrementOtherNodes() {
        Atomics.add(this.nodesCounters, allNodes, 1);
    }

    async complete(node) {
        await node.lock.synchronize(node.callbackService, async () => {
            // full environment
            let fullEnvironment = await node.getFullEnvironment(environmentId);

            // complete event
            let event = new events.CompletedEvent();
            event.getEnvironment = () => fullEnvironment.environment;
            fullEnvironment.follower.onContractSubscriptionEvent(event);

            await fullEnvironment.environment.save();
        });
    }

    async fail(node) {
        await node.lock.synchronize(node.callbackService, async () => {
            // full environment
            let fullEnvironment = await node.getFullEnvironment(environmentId);

            // fail event
            let event = new events.FailedEvent();
            event.getEnvironment = () => fullEnvironment.environment;
            fullEnvironment.follower.onContractSubscriptionEvent(event);

            await fullEnvironment.environment.save();
        });
    }

    async spent(node) {
        await node.lock.synchronize(node.callbackService, async () => {
            // full environment
            let fullEnvironment = await node.getFullEnvironment(environmentId);

            // spent event
            let event = new events.SpentEvent();
            event.getEnvironment = () => fullEnvironment.environment;
            fullEnvironment.follower.onContractSubscriptionEvent(event);

            await fullEnvironment.environment.save();
        });
    }

    /**
     * Set network consensus needed for synchronize callback state. And set limit of network nodes count needed for
     * delete callback record (if 80% network nodes respond, but the state of the callback cannot be synchronized).
     *
     * @param {number} nodesCount - Count of nodes in Universa network.
     */
    setConsensusAndLimit(nodesCount) {
        this.consensus = Math.ceil((nodesCount - 1) * 0.51);
        this.limit = Math.floor(nodesCount * 0.8);
    }

    /**
     * Increases callback state counters according new state received from notification. Callback state will be
     * synchronized if the number of notifications from Universa nodes with states COMPLETED or FAILED reached
     * a given consensus.
     *
     * @param {FollowerCallbackState} newState - Callback state received from notification.
     * @param {Ledger} ledger - Node ledger.
     * @param {Node} node - Universa node.
     * @return {boolean} true if callback state is synchronized.
     */
    async synchronizeState(newState, ledger, node) {
        if (newState === FollowerCallbackState.COMPLETED) {
            if (this.incrementCompletedNodes() >= this.consensus) {
                if (this.state === FollowerCallbackState.STARTED)
                    await this.complete(node);
                else if (this.state === FollowerCallbackState.EXPIRED)
                    await this.spent(node);

                await ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.COMPLETED);
                return true;
            }
        } else if ((newState === FollowerCallbackState.FAILED) || (newState === FollowerCallbackState.EXPIRED)) {
            if (this.incrementFailedNodes() >= this.consensus) {
                if (this.state === FollowerCallbackState.STARTED)
                    await this.fail(node);

                await ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.FAILED);
                return true;
            }
        } else
            this.incrementOtherNodes();

        return false;
    }

    /**
     * Final checkout of the callback state counters if the time to synchronize callback expired. Callback state
     * will be synchronized if the number of notifications from Universa nodes with states COMPLETED or FAILED reached
     * a given consensus.
     *
     * If reached the callback synchronization consensus, updates state of the callback in ledger.
     * If reached the nodes limit for ending synchronization (but the state of the callback cannot be synchronized),
     * callback record removes from ledger.
     *
     * @param {Ledger} ledger - Node ledger.
     * @param {Node} node - Universa node.
     * @return {boolean} true if callback synchronization is ended.
     */
    async endSynchronize(ledger, node) {
        if (this.expiresAt != null && this.expiresAt.getTime() > Date.now())
            return false;

        // final (additional) check for consensus of callback state
        if (Atomics.load(this.nodesCounters, completedNodes) >= this.consensus) {
            if (this.state === FollowerCallbackState.STARTED)
                await this.complete(node);
            else if (this.state === FollowerCallbackState.EXPIRED)
                await this.spent(node);

            await ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.COMPLETED);
        } else if (Atomics.load(this.nodesCounters, failedNodes) >= this.consensus) {
            if (this.state === FollowerCallbackState.STARTED)
                await this.fail(node);

            await ledger.updateFollowerCallbackState(this.id, FollowerCallbackState.FAILED);
        } else if (Atomics.load(this.nodesCounters, allNodes) >= this.limit)
            // remove callback if synchronization is impossible
            await ledger.removeFollowerCallback(this.id);

        return true;
    }
}

module.exports = {CallbackRecord};