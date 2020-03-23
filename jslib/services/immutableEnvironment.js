/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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
     * @param {string} keyName - Key name.
     * @param defaultValue - Value to return if the KV store is empty.
     *
     * @return the stored value or the default value.
     */
    get(keyName, defaultValue) {
        throw new Error("not implemented");
    }

    /**
     * Get array of contract subscription.
     *
     * @return {Array<ContractSubscription>} array of contract subscription.
     */
    subscriptions() {
        throw new Error("not implemented");
    }

    /**
     * Get array of contract storages.
     *
     * @return {Array<ContractStorage>} array of contract storages.
     */
    storages() {
        throw new Error("not implemented");
    }

    /**
     * Get array of UNS mame records.
     *
     * @return {Array<NameRecord>} array of UNS mame records.
     */
    nameRecords() {
        throw new Error("not implemented");
    }

    /**
     * Get array of UNS records.
     *
     * @return {Array<NameRecordEntry>} array of UNS records.
     */
    nameRecordEntries() {
        throw new Error("not implemented");
    }

    /**
     * Get follower contract service.
     *
     * @param {boolean} init - Initialize follower service if not initialized. Optional. Default - false.
     * @return {FollowerService} follower contract service.
     */
    getFollowerService(init) {
        throw new Error("not implemented");
    }

    /**
     * Availability check for reduced names, origins and addresses.
     *
     * @param {Array<string>} reducedNamesToAllocate - Reduced names for availability check.
     * @param {Array<HashId>} originsToAllocate - Origins for availability check.
     * @param {Array<string>} addressesToAllocate - Addresses for availability check.
     * @return {Array<ErrorRecord>} array of availability errors.
     */
    tryAllocate(reducedNamesToAllocate, originsToAllocate, addressesToAllocate) {
        throw new Error("not implemented");
    }
}

module.exports = {ImmutableEnvironment};