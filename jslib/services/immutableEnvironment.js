/**
 * The environment accessible to readonly {@see NContract} methods, e.g.
 * {@see NContract#onRevoked(ImmutableEnvironment)} and like.
 *
 * Note that the environment associated with {@see NContract} must be destroyed when the NContract is revoked.
 *
 * @interface ImmutableEnvironment
 */
class ImmutableEnvironment {

    /**
     * Read access to the instance server-size key-value store. Note that if the store is not created, it always return
     * default value, this is not an error.
     *
     * @param {string} keyName - key name
     * @param defaultValue - value to return if the KV store is empty
     *
     * @return the stored value or the default value
     */
    get(keyName, defaultValue) {
        throw new Error("not implemented");
    }

    /**
     * Get array of contract subscription.
     *
     * @return {[ContractSubscription]} array of contract subscription.
     */
    subscriptions() {
        throw new Error("not implemented");
    }

    /**
     * Get array of contract storages.
     *
     * @return {[ContractStorage]} array of contract storages.
     */
    storages() {
        throw new Error("not implemented");
    }

    /**
     * Get array of UNS mame records.
     *
     * @return {[NameRecord]} array of UNS mame records.
     */
    nameRecords() {
        throw new Error("not implemented");
    }

    /**
     * Get follower contract service.
     *
     * @param {boolean} init - initialize follower service if not initialized. Optional. Default - false.
     * @return {FollowerService} follower contract service.
     */
    getFollowerService(init) {
        throw new Error("not implemented");
    }

    /**
     * Availability check for reduced names, origins and addresses.
     *
     * @param {[string]} reducedNamesToAllocate - reduced names for availability check.
     * @param {[HashId]} originsToAllocate - origins for availability check.
     * @param {[string]} addressesToAllocate - addresses for availability check.
     * @return {[ErrorRecord]} array of availability errors.
     */
    tryAllocate(reducedNamesToAllocate, originsToAllocate, addressesToAllocate) {
        throw new Error("not implemented");
    }
}

module.exports = {ImmutableEnvironment};