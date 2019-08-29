/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/**
 * Universa network callback service interface. The service creates a callback processor, sends a callback to distant callback URL,
 * notifies the follower contract of a state change, notifies the other network nodes, and synchronizes the callback states.
 *
 * @interface CallbackService
 */
class CallbackService {
    /**
     * Runs callback processor for one callback. Adds callback record to ledger, runs callback processing thread and
     * checks and obtains deferred callback notifications.
     *
     * @param {Contract} updatingItem is new revision of following contract
     * @param {ItemState} state is state of new revision of following contract
     * @param {NSmartContract} contract is follower contract
     * @param {MutableEnvironment} me is environment
     */
    async startCallbackProcessor(updatingItem, state, contract, me) {
        throw new Error("not implemented");
    }
}

module.exports = {CallbackService};