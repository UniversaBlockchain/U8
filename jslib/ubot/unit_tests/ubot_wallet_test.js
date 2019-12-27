/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
import {expect, assert, unit} from 'test'

const wallet = require("ubot/ubot_wallet");
const UBotClient = require('ubot/ubot_client').UBotClient;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const ItemState = require("itemstate").ItemState;
const cs = require("contractsservice");
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const BigDecimal  = require("big").Big;
const tt = require("test_tools");

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const TOPOLOGY_FILE = "mainnet_topology.json";

const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

async function createPayment(cost) {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let U = await tt.createFreshU(100000000, [userPrivKey.publicKey]);
    U.registerRole(new roles.SimpleRole("issuer", tk.getTestKey().longAddress));
    await U.seal(true);

    await U.addSignatureToSeal(tk.getTestKey());
    let ir = await netClient.register(await U.getPackedTransaction(), 10000);

    assert(ir.state === ItemState.APPROVED);

    U = await U.createRevision([userPrivKey]);
    U.state.data.transaction_units = U.state.data.transaction_units - cost;
    await U.seal();

    await netClient.shutdown();

    return U;
}

unit.test("ubot_wallet_test: wallet put and transfer", async () => {
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    // test token
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));

    console.log("Register base token...");
    let ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    let walletKey = tk.TestKeys.getKey();
    let walletContract = await wallet.createWallet(walletKey, 10, 12);

    console.log("Register wallet...");
    ir = await netClient.register(await walletContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // put token into wallet
    let packedToken = await wallet.prepareToken(walletContract, tokenContract, [tokenIssuerKey]);

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "putTokenIntoWallet";
    requestContract.state.data.method_args = [packedToken];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "1000");

    // make transfer
    // let recipientKey = tk.TestKeys.getKey();
    // requestContract = Contract.fromPrivateKey(walletKey);
    // requestContract.state.data.method_name = "makeTranfer";
    // requestContract.state.data.method_args = [120, new crypto.KeyAddress(recipientKey.publicKey, 0, true)];
    // requestContract.state.data.executable_contract_id = walletContract.id;
    //
    // await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
    //     Constraint.TYPE_EXISTING_STATE, [
    //         "this.state.data.executable_contract_id == ref.id",
    //         "this can_perform ref.state.roles.walletOwner"
    //     ], true);
    //
    // state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);
    //
    // console.log("State: " + JSON.stringify(state));
    //
    // assert(state.state === UBotPoolState.FINISHED.val && state.result instanceof Uint8Array);

    await netClient.shutdown();
    await ubotClient.shutdown();
});