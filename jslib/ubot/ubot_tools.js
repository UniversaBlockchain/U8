/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ex = require("exceptions");

/**
 * Get executable contract of request cloud method.
 *
 * @param {Contract} requestContract - The request contract.
 * @return {Contract} executable contract.
 */
function getExecutableContract(requestContract) {
    return requestContract.transactionPack.referencedItems.get(requestContract.state.data.executable_contract_id);
}

/**
 * Get the number of UBots in the pool and quorum by request and UBots registry contracts.
 *
 * @param {Contract} requestContract - The request contract.
 * @param {Contract} registryContract - The UBots registry contract.
 * @return {Object} fields in the object:
 *      pool - number of UBots in the pool,
 *      quorum - number of UBots in the quorum.
 * @throws {IllegalStateError} exception for incorrect request or UBots registry contract.
 */
function getPoolAndQuorum(requestContract, registryContract) {
    if (registryContract == null)
        throw new ex.IllegalStateError("Need UBots registry contract for get count of UBots");

    let ubots = 0;
    try {
        ubots = registryContract.state.roles.ubots.roles.length;
    } catch (err) {
        throw new ex.IllegalStateError("Incorrect UBots registry: " + err.message);
    }

    if (ubots === 0)
        throw new ex.IllegalStateError("Incorrect UBots registry: no UBots");

    return getRequestPoolAndQuorum(requestContract, ubots);
}

/**
 * Get the number of UBots in the pool and quorum by request and UBots count.
 *
 * @param {Contract} requestContract - The request contract.
 * @param {number} count - UBots count.
 * @return {Object} fields in the object:
 *      pool - number of UBots in the pool,
 *      quorum - number of UBots in the quorum.
 * @throws {IllegalStateError} exception for incorrect request contract.
 */
function getRequestPoolAndQuorum(requestContract, count) {
    return getPoolAndQuorumFromMetadata(
        getExecutableContract(requestContract).state.data.cloud_methods[requestContract.state.data.method_name],
        count
    );
}

/**
 * Get the number of UBots in the pool and quorum by method (or storage) metadata and UBots count.
 *
 * @param {Object} metadata - Method (or storage) metadata.
 * @param {number} count - UBots count.
 * @return {Object} fields in the object:
 *      pool - number of UBots in the pool,
 *      quorum - number of UBots in the quorum.
 * @throws {IllegalStateError} exception for incorrect method (or storage) metadata.
 */
function getPoolAndQuorumFromMetadata(metadata, count) {
    let pool = metadata.pool;
    if (pool != null) {
        if (pool.size != null && typeof pool.size === "number" && pool.size > 0 && pool.size <= count)
            pool = pool.size;
        else if (pool.percentage != null && typeof pool.percentage === "number" && pool.percentage > 0 && pool.percentage <= 100) {
            pool = Math.ceil(count * pool.percentage / 100);

            if (pool === 0)
                new ex.IllegalStateError("Pool size can`t be 0");
        } else
            throw new ex.IllegalStateError("Pool size is not correctly specified as a constant (pool.size) or as a percentage (pool.percentage)");
    } else
        throw new ex.IllegalStateError("Pool is not specified");

    let quorum = metadata.quorum;
    if (quorum != null) {
        if (quorum.size != null && typeof quorum.size === "number" && quorum.size > 0 && quorum.size <= pool)
            quorum = quorum.size;
        else if (quorum.percentage != null && typeof quorum.percentage === "number" && quorum.percentage > 0 && quorum.percentage <= 100) {
            quorum = Math.ceil(pool * quorum.percentage / 100);

            if (quorum === 0)
                new ex.IllegalStateError("Quorum can`t be 0");
        } else
            throw new ex.IllegalStateError("Quorum is not correctly specified as a constant (quorum.size) or as a percentage (quorum.percentage)");
    } else
        throw new ex.IllegalStateError("Quorum is not specified");

    return {
        pool: pool,
        quorum: quorum
    };
}

/**
 * Get storage read trust level of request cloud method.
 *
 * @param {Contract} requestContract - The request contract.
 * @return {number} trust level.
 */
function getRequestStorageReadTrustLevel(requestContract) {
    return getExecutableContract(requestContract).state.data.cloud_methods[requestContract.state.data.method_name].storage_read_trust_level;
}

/**
 * Get max waiting period for ubot answer from request cloud method.
 *
 * @param {Contract} requestContract - The request contract.
 * @return {number | null} max waiting period in milliseconds or null if period is undefined.
 */
function getRequestMaxWaitUbot(requestContract) {
    let seconds = getExecutableContract(requestContract).state.data.cloud_methods[requestContract.state.data.method_name].max_wait_ubot;
    if (seconds == null)
        return null;
    return seconds * 1000;
}

module.exports = {getExecutableContract, getPoolAndQuorum, getPoolAndQuorumFromMetadata, getRequestPoolAndQuorum,
    getRequestStorageReadTrustLevel, getRequestMaxWaitUbot};