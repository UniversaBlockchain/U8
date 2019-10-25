/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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
 * Get quorum size of request cloud method.
 *
 * @param {Contract} requestContract - The request contract.
 * @return {number} quorum size.
 */
function getRequestQuorumSize(requestContract) {
    return getExecutableContract(requestContract).state.data.cloud_methods[requestContract.state.data.method_name].quorum.size;
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

module.exports = {getExecutableContract, getRequestQuorumSize, getRequestStorageReadTrustLevel, getRequestMaxWaitUbot};