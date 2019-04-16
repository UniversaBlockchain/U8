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
    getExtendedType();

    /**
     * Check the smart contract could be created.
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeCreate(e);

    /**
     * Check the smart contract could be updated (e.g. new revision could be registered).
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeUpdate(e);

    /**
     * Check the smart contract could be revoked.
     *
     * @param {ImmutableEnvironment} e
     * @return {boolean} true it if can be created.
     */
    beforeRevoke(e);

    /**
     * Called after the new contract is approved by the network.
     *
     * @param {MutableEnvironment} me
     * @return {Object} extra data to pass to the calling client or null.
     */
    onCreated(me);

    /**
     * Called after the new contract revision is approved by the network.
     *
     * @param {MutableEnvironment} me
     * @return {Object} extra data to pass to the calling client or null.
     */
    onUpdated(me);

    /**
     * Called when the contract is just revoked by the network.
     *
     * @param {ImmutableEnvironment} me
     */
    onRevoked(me);

    /**
     * Call the readonly method (query) that does not change the contract inner state (neither the contract nor
     * any associated data) and return the result.
     *
     * @param {ImmutableEnvironment} e
     * @param {string} methodName
     * @param {Object|Null} params - Params or null.
     * @return {Object} the results.
     */
    //query(e, methodName, params);

    /**
     * For the {@link ContractSubscription} the instance will receive event notifications with this callback.
     *
     * @param {ContractSubscription.Event} event
     */
    onContractSubscriptionEvent(event) {}
}
