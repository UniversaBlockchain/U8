/**
 * Node-side smart contract handler.
 *
 * Used to implement node-side smart contract functionality (e.g. slot contract and other incoming types)
 *
 * @interface NContract
 */
class NContract {

    /**
     * This is a string tag which is used to find the proper {@link NContract}.
     * implementation.
     *
     * @return {string }string tag, e.g. "SLOT1".
     */
    getExtendedType() {
        throw new Error("not implemented");
    }

    /**
     * Check the smart contract could be created.
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeCreate(e) {
        throw new Error("not implemented");
    }

    /**
     * Check the smart contract could be updated (e.g. new revision could be registered).
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeUpdate(e) {
        throw new Error("not implemented");
    }

    /**
     * Check the smart contract could be revoked.
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeRevoke(e) {
        throw new Error("not implemented");
    }

    /**
     * Called after the new contract is approved by the network.
     *
     * @param {MutableEnvironment} me
     * @return {Object} extra data to pass to the calling client or null.
     */
    onCreated(me) {
        throw new Error("not implemented");
    }

    /**
     * Called after the new contract revision is approved by the network.
     *
     * @param {MutableEnvironment} me
     * @return {Object} extra data to pass to the calling client or null.
     */
    onUpdated(me) {
        throw new Error("not implemented");
    }

    /**
     * Called when the contract is just revoked by the network.
     *
     * @param {ImmutableEnvironment} me
     */
    onRevoked(me) {
        throw new Error("not implemented");
    }

    /**
     * For the {@link ContractSubscription} the instance will receive event notifications with this callback.
     *
     * @param {ContractSubscription.Event} event
     */
    onContractSubscriptionEvent(event) {
        throw new Error("not implemented");
    }
}

module.exports = {NContract};