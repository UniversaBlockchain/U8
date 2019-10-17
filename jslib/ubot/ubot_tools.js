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

module.exports = {getExecutableContract, getRequestQuorumSize};