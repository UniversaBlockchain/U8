/**
 * The environment accessible to readonly {@see NContract} methods, e.g.
 * {@see NContract#query(ImmutableEnvironment, String, Binder)} and
 * {@see NContract#onRevoked(ImmutableEnvironment)} and like.
 *
 * Note tha the environment associated with {@see NContract} must be destroyed when the NContract is revoked.
 *
 * @interface ImmutableEnvironment
 */
class ImmutableEnvironment {

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