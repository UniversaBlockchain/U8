/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as io from "io";

const ex = require("exceptions");
const roles = require('roles');
const Constraint = require('constraint').Constraint;

const EXECUTABLE_CONTRACTS_PATH = "../jslib/ubot/executable_contracts/";

/**
 * Create wallet executable contract.
 *
 * @param {PrivateKey} ownerKey - Key of the wallet owner.
 * @param {number} quorum - Quorum of UBots for transfer token operations.
 * @param {number} pool - Pool of UBots for request transfer token operations.
 * @param {number} gettingQuorum - Quorum of UBots for request get wallet operations. Default is 3.
 * @param {number} gettingPool - Pool of UBots for request get wallet operations. Default is 4.
 * @return {Contract} wallet executable contract ready for register.
 */
async function createWallet(ownerKey, quorum, pool, gettingQuorum = 3, gettingPool = 4) {
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
            max_wait_ubot: 60,
            launcher: "walletOwner"
        },
        getLastOperation: {
            pool: {size: gettingPool},
            quorum: {size: gettingQuorum},
            max_wait_ubot: 30,
            launcher: "walletOwner"
        },
        getOperations: {
            pool: {size: gettingPool},
            quorum: {size: gettingQuorum},
            max_wait_ubot: 30,
            launcher: "walletOwner"
        },
        getBalance: {
            pool: {size: gettingPool},
            quorum: {size: gettingQuorum},
            max_wait_ubot: 30,
            launcher: "walletOwner"
        }
    };

    walletContract.registerRole(new roles.RoleLink("walletOwner", "owner"));

    walletContract.state.data.js = await io.fileGetContentsAsString(EXECUTABLE_CONTRACTS_PATH + "wallet.js");

    await walletContract.seal();

    return walletContract;
}

/**
 * Prepare token to put into the wallet.
 *
 * @param {Contract} walletContract - Wallet executable contract.
 * @param {Contract} token - Token to put into the wallet.
 * @param {Iterable<crypto.PrivateKey> | null} tokenOwnerKeys - Keys of token owner.
 * @return {Uint8Array} packed transaction with token contract ready for put into wallet.
 */
async function prepareToken(walletContract, token, tokenOwnerKeys) {
    let walletToken = await token.createRevision(tokenOwnerKeys);

    // quorum vote role
    let quorum = walletContract.state.data.cloud_methods.putTokenIntoWallet.quorum.size.toString();
    walletToken.registerRole(new roles.QuorumVoteRole("owner", "refUbotRegistry.state.roles.ubots", quorum, walletToken));
    walletToken.registerRole(new roles.QuorumVoteRole("creator", "refUbotRegistry.state.roles.ubots", quorum, walletToken));

    // constraint for UBotNet registry contract
    walletToken.createTransactionalSection();
    let constr = new Constraint(walletToken);
    constr.name = "refUbotRegistry";
    constr.type = Constraint.TYPE_TRANSACTIONAL;
    let conditions = {};
    conditions[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
    constr.setConditions(conditions);
    walletToken.addConstraint(constr);

    await walletToken.seal();

    return await walletToken.getPackedTransaction();
}

module.exports = {createWallet, prepareToken};