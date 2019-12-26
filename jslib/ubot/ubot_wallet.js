/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ex = require("exceptions");

/**
 * Create wallet executable contract.
 *
 * @param {PrivateKey} ownerKey - Key of the wallet owner.
 * @param {number} quorum - Quorum of UBots for transfer token operations.
 * @param {number} pool - Pool of UBots for request transfer token operations.
 * @param {number} gettingQuorum - Quorum of UBots for request get wallet operations. Default is 4.
 * @param {number} gettingPool - Pool of UBots for request get wallet operations. Default is 4.
 * @return {Contract} wallet executable contract ready for register.
 */
async function createWallet(ownerKey, quorum, pool, gettingQuorum = 4, gettingPool = 4) {
    if (pool <= 1 || quorum <= 1 || quorum > pool)
        throw new ex.IllegalArgumentError("Illegal pool or quorum of wallet");

    let walletContract = Contract.fromPrivateKey(ownerKey);

    walletContract.state.data.cloud_methods = {
        putTokenIntoWallet: {
            pool: {size: pool},
            quorum: {size: quorum},
            max_wait_ubot: 60
        },
        makeTranfer: {
            pool: {size: pool},
            quorum: {size: quorum},
            max_wait_ubot: 60
        },
        getLastTransfer: {
            pool: {size: gettingPool},
            quorum: {size: gettingQuorum},
            max_wait_ubot: 30
        }
    };

    //walletContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "wallet.js");

    await walletContract.seal();

    return walletContract;
}

/**
 * Prepare token to put into the wallet.
 *
 * @param {PublicKey} walletContract - Wallet executable contract.
 * @param {PublicKey} token - Token to put into the wallet.
 * @return {Contract} wallet executable contract ready for register.
 */
async function prepareToken(walletContract, token) {

}