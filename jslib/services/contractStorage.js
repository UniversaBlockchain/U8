/**
 * Subscription to store one revision of the packed contract (transaction pack)
 * The subscribers ({@link NContract} instances) subscribe to contracts to store them for some amount of time. All
 * subscriptions share same copy of the stored contract. When the last susbscription to this revision is destroyed or
 * expired, the copy is dropped.
 * Note that subscriptions are private to {@link NContract} instances and visible only to it. When the NContract is
 * revoked, all its subscriptions must be destroyed.
 *
 * @interface ContractStorage
 */
class ContractStorage {

    /**
     * Get expiration time for contract storage.
     *
     * @return {Date} the expiration time for contract storage.
     */
    getExpiresAt() {
        throw new Error("not implemented");
    }

    /**
     * Get contract.
     *
     * @return {Promise<Contract>} the unpacked stored contract. Note that this instance could be cached/shared among subscribers.
     */
    async getContract() {
        throw new Error("not implemented");
    }

    /**
     * Get stored transaction pack.
     *
     * @return {number[]} stored packed representation (transaction pack).
     */
    getPackedContract() {
        throw new Error("not implemented");
    }
}

module.exports = {ContractStorage};