const ImmutableEnvironment = require("services/immutableEnvironment").ImmutableEnvironment;

/**
 * The RW environment for {@see NContract} instance, where it can change its server state.
 *
 * It implements KV store for the server-state. It is created automatically first time {@link #set(String, Object)} is
 * called and must commit any changes to the ledger when the new contract state is being approved. Before this the
 * ledger state must not be altered.
 *
 * The RC problem should be repelled by saving the state of the "approved" contract only. To do this. the nodes must
 * extend voting by adding state's CRC2-384 hash to the voting ID and copy the state of the approved contract as need
 *
 * @interface MutableEnvironment
 */
class MutableEnvironment extends ImmutableEnvironment {

    /**
     * Writes a key to the KV store. See the logic description above.
     *
     * @param {string} key
     * @param value
     *
     * @return if an existing key is passed then the previous value gets returned, else undefined is returned.
     */
    set(key, value);

    /**
     * Create follower subscription to the chain of contracts
     *
     * @param {HashId} origin - Origin of contracts chain.
     * @param {Date} expiresAt - Time to expiration subscription.
     *
     * @return {ContractSubscription} follower subscription.
     */
    createChainSubscription(origin, expiresAt);

    /**
     * Create subscription to a packed contract. It always creates the subscription to new or existing contract.
     *
     * @param {HashId} id - Contract identifier.
     * @param {Date} expiresAt - Time to expiration subscription.
     *
     * @return {ContractSubscription} storage subscription.
     */
    createContractSubscription(id, expiresAt);

    /**
     * Create storage for a packed contract.
     * The storage must not create copies of the same contracts or update its stored binary representations. There
     * should be always no one copy in the storage.
     *
     * @param {[number]} packedTransaction - Packed {@see TransactionPack} with contract.
     * @param {Date} expiresAt - Time to expiration subscription.
     *
     * @return {ContractStorage} storage subscription.
     */
    createContractStorage(packedTransaction, expiresAt);

    /**
     *
     * @param {UnsName} unsName - UNS name.
     * @param {Date} expiresAt -
     */
    createNameRecord(unsName, expiresAt);

    /**
     * Set expiration time for subscription.
     *
     * @param {ContractSubscription} subscription - Subscription.
     * @param {Date} expiresAt - Time to expiration subscription.
     */
    setSubscriptionExpiresAt(subscription, expiresAt);

    /**
     * Set expiration time for contract storage.
     *
     * @param {ContractStorage} storage - Contract storage.
     * @param {Date} expiresAt - Time to expiration contract storage.
     */
    setStorageExpiresAt(storage, expiresAt);

    /**
     * Set expiration time for storing UNS name.
     *
     * @param {NameRecord} nameRecord - UNS name record.
     * @param {Date} expiresAt - Time to expiration UNS name.
     */
    setNameRecordExpiresAt(nameRecord, expiresAt);

    /**
     * Remove subscription from the ledger.
     *
     * @param {ContractSubscription} subscription - Subscription.
     */
    destroySubscription(subscription);

    /**
     * Remove stored contract from the ledger.
     *
     * @param {ContractStorage} contractStorage - Contract storage.
     */
    destroyStorage(contractStorage);

    /**
     * Remove UNS name from the ledger.
     *
     * @param {NameRecord} nameRecord - UNS name record.
     */
    destroyNameRecord(nameRecord);
}

module.exports = {MutableEnvironment};