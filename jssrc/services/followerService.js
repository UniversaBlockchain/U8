/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/**
 * Service for storing information about subscriptions to callbacks in the follower contract.
 * Allows you to receive and set the time to which it is possible to sending callbacks,
 * the amount of spent U for sending callbacks, the number of running callbacks.
 *
 * @interface FollowerService
 */
class FollowerService {
    /**
     * Get expiration time for callback subscription.
     *
     * @return {Date} the expiration time.
     */
    getExpiresAt() {
        throw new Error("not implemented");
    }

    /**
     * Get the time to which it is possible to send callbacks (as long as there is enough money to send at least 1 callback).
     *
     * @return {Date}
     */
    getMutedAt() {
        throw new Error("not implemented");
    }

    /**
     * Set expiration and muted time for follower service.
     * Muted follower service is not removed from the ledger, but callbacks are no longer executed (due to lack of funds).
     *
     * @param {Date} expiresAt - Expiration time for follower service.
     * @param {Date} mutedAt - Muted time for follower service.
     */
    setExpiresAndMutedAt(expiresAt, mutedAt) {
        throw new Error("not implemented");
    }

    /**
     * Get origin-days spent for callbacks in follower service.
     *
     * @return {number} spent origin-days.
     */
    getCallbacksSpent() {
        throw new Error("not implemented");
    }

    /**
     * Get number of started callbacks in follower service.
     *
     * @return {number} number of started callbacks.
     */
    getStartedCallbacks() {
        throw new Error("not implemented");
    }

    /**
     * Decrease time to expiration follower service.
     *
     * @param {number} decreaseSeconds - Interval in seconds for which subscription time is reduced.
     */
    decreaseExpiresAt(decreaseSeconds) {
        throw new Error("not implemented");
    }

    /**
     * Change muted time of follower service.
     *
     * @param {number} deltaSeconds - Interval in seconds for which subscription muted time is changed.
     */
    changeMutedAt(deltaSeconds) {
        throw new Error("not implemented");
    }

    /**
     * Increase origin-days spent for callbacks of follower service.
     *
     * @param {number} addSpent - Spent origin-days.
     */
    increaseCallbacksSpent(addSpent) {
        throw new Error("not implemented");
    }

    /**
     * Increment number of started callbacks of follower service.
     */
    increaseStartedCallbacks() {
        throw new Error("not implemented");
    }

    /**
     * Decrement number of started callbacks of follower service.
     */
    decreaseStartedCallbacks() {
        throw new Error("not implemented");
    }

    /**
     * Schedule callback processor for one callback.
     *
     * @param {Contract} updatingItem - New revision of following contract.
     * @param {ItemState} state - State of new revision of following contract.
     * @param {NSmartContract} contract - Contract is follower contract.
     * @param {MutableEnvironment} me - Environment.
     * @param {CallbackService} callbackService - Node callback service.
     */
    scheduleCallbackProcessor(updatingItem, state, contract, me, callbackService) {
        throw new Error("not implemented");
    }
}

module.exports = {FollowerService};