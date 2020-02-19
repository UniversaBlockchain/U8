/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as io from "io";

const ex = require("exceptions");
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const UBotClient = require('ubot/ubot_client').UBotClient;
const ItemState = require("itemstate").ItemState;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const Parcel = require("parcel").Parcel;
const cs = require("contractsservice");

const EXECUTABLE_CONTRACTS_PATH = "../jslib/ubot/executable_contracts/";
const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const TOPOLOGY_FILE = "mainnet_topology.json";

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

class UBotWallet {
    constructor(ownerKey, quorum, pool, gettingQuorum = 3, gettingPool = 4) {
        this.walletKey = ownerKey;
        this.quorum = quorum;
        this.pool = pool;
        this.gettingQuorum = gettingQuorum;
        this.gettingPool = gettingPool;
        this.walletContract = null;
        this.clientKey = null;
        this.client = null;
    }

    async init() {
        this.walletContract = await createWallet(this.walletKey, this.quorum, this.pool, this.gettingQuorum, this.gettingPool);

        this.walletContract.getPackedTransaction();
        if (!(await this.walletContract.check()))
            throw new Error("Failed check wallet contract: " + JSON.stringify(this.walletContract.errors));

        return this.walletContract.getProcessedCostU();
    }

    async register(clientKey, payment) {
        this.clientKey = clientKey;
        this.client = await new UBotClient(this.clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

        if (this.walletContract == null)
            throw new Error("Wallet isn`t created");

        await payment.getPackedTransaction();
        let parcel = new Parcel(this.walletContract.transactionPack, payment.transactionPack);

        let ir = await this.client.registerParcelWithState(await parcel.pack(), 10000);
        if (ir.state !== ItemState.APPROVED)
            throw new Error("Failed registration of wallet contract. Item result: " + JSON.stringify(ir));
    }

    async put(token, tokenOwnerKeys, payment) {
        let packedToken = await prepareToken(this.walletContract, token, tokenOwnerKeys);

        let requestContract = Contract.fromPrivateKey(this.clientKey);
        requestContract.state.data.method_name = "putTokenIntoWallet";
        requestContract.state.data.method_args = [packedToken];
        requestContract.state.data.executable_contract_id = this.walletContract.id;

        await cs.addConstraintToContract(requestContract, this.walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        let state = await this.client.executeCloudMethod(requestContract, payment);
        if (state.state !== UBotPoolState.FINISHED.val)
            throw new Error("Failed execution cloud method putTokenIntoWallet. State: " + JSON.stringify(state));

        return state.result;
    }

    async transfer(amount, recipientAddress, payment) {
        let requestContract = Contract.fromPrivateKey(this.walletKey);
        requestContract.state.data.method_name = "makeTranfer";
        requestContract.state.data.method_args = [amount, recipientAddress];
        requestContract.state.data.executable_contract_id = this.walletContract.id;

        await cs.addConstraintToContract(requestContract, this.walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        let state = await this.client.executeCloudMethod(requestContract, payment);
        if (state.state !== UBotPoolState.FINISHED.val)
            throw new Error("Failed execution cloud method makeTranfer. State: " + JSON.stringify(state));

        return await Contract.fromSealedBinary(state.result);
    }

    async getLastOperation(payment) {
        let requestContract = Contract.fromPrivateKey(this.walletKey);
        requestContract.state.data.method_name = "getLastOperation";
        requestContract.state.data.executable_contract_id = this.walletContract.id;

        await cs.addConstraintToContract(requestContract, this.walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        let state = await this.client.executeCloudMethod(requestContract, payment);
        if (state.state !== UBotPoolState.FINISHED.val)
            throw new Error("Failed execution cloud method getLastOperation. State: " + JSON.stringify(state));

        return state.result;
    }

    async getOperations(payment) {
        let requestContract = Contract.fromPrivateKey(this.walletKey);
        requestContract.state.data.method_name = "getOperations";
        requestContract.state.data.executable_contract_id = this.walletContract.id;

        await cs.addConstraintToContract(requestContract, this.walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        let state = await this.client.executeCloudMethod(requestContract, payment);
        if (state.state !== UBotPoolState.FINISHED.val)
            throw new Error("Failed execution cloud method getOperations. State: " + JSON.stringify(state));

        return state.result;
    }

    async getBalance(payment) {
        let requestContract = Contract.fromPrivateKey(this.walletKey);
        requestContract.state.data.method_name = "getBalance";
        requestContract.state.data.executable_contract_id = this.walletContract.id;

        await cs.addConstraintToContract(requestContract, this.walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        let state = await this.client.executeCloudMethod(requestContract, payment);
        if (state.state !== UBotPoolState.FINISHED.val)
            throw new Error("Failed execution cloud method getBalance. State: " + JSON.stringify(state));

        return state.result;
    }

    async close() {
        await this.client.shutdown();
    }
}

module.exports = {UBotWallet, createWallet, prepareToken};