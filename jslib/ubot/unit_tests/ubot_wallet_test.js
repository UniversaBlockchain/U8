/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
import {expect, assert, unit} from 'test'

const wallet = require("ubot/ubot_wallet");
const UBotMain = require("ubot/ubot_main").UBotMain;
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
const CONFIG_ROOT = "../test/config/ubot_config";

const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

const LOCAL_UBOTS = false;
const ubotsCount = 30;

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

async function createUbotMain(name, nolog) {
    let args = ["--config", CONFIG_ROOT+"/"+name];
    if (nolog)
        args.push("--nolog");

    return new Promise(async resolve => {
        let ubotMain = new UBotMain(...args);
        await ubotMain.start();
        resolve(ubotMain);
    });
}

async function createUBots(count) {
    //await prepareConfigFiles(count);
    let ubotMains = [];
    for (let i = 0; i < count; ++i)
        ubotMains.push(createUbotMain("ubot"+i, false));
    ubotMains = await Promise.all(ubotMains);
    require("ubot/unit_tests/ubot_debugger").ubotDebugger_setMains(ubotMains);
    return ubotMains;
}

async function shutdownUBots(ubots) {
    let promises = [];
    for (let i = 0; i < ubots.length; ++i)
        promises.push(ubots[i].shutdown());
    return Promise.all(promises);
}

unit.test("ubot_wallet_test: wallet put and transfer", async () => {
    let ubotMains = [];
    if (LOCAL_UBOTS)
        ubotMains = await createUBots(ubotsCount);

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
    let recipientKey = tk.TestKeys.getKey();
    let recipientAddress = new crypto.KeyAddress(recipientKey.publicKey, 0, true).toString();
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "makeTranfer";
    requestContract.state.data.method_args = [120, recipientAddress];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result instanceof Uint8Array);

    let transfer = await Contract.fromSealedBinary(state.result);
    assert(transfer.state.data.amount === "120");

    // check balance
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getBalance";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "880");

    // check last operation
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getLastOperation";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.operation === "transfer" &&
        state.result.amount === "120" && state.result.recipient === recipientAddress);

    // check transfer token
    transfer = await transfer.createRevision([recipientKey]);
    transfer.registerRole(new roles.SimpleRole("owner", userPrivKey, transfer));
    await transfer.seal(true);

    console.log("Change owner of transfer token...");
    ir = await netClient.register(await transfer.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    await netClient.shutdown();
    await ubotClient.shutdown();

    if (LOCAL_UBOTS)
        await shutdownUBots(ubotMains);
});

unit.test("ubot_wallet_test: empty wallet", async () => {
    let ubotMains = [];
    if (LOCAL_UBOTS)
        ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let walletKey = tk.TestKeys.getKey();
    let walletContract = await wallet.createWallet(walletKey, 10, 12);

    console.log("Register wallet...");
    let ir = await netClient.register(await walletContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // check balance
    let requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getBalance";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "0");

    // check operations
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getOperations";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.length === 0);

    // check last operation
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getLastOperation";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result == null);

    // transfer attempt
    let recipientKey = tk.TestKeys.getKey();
    let recipientAddress = new crypto.KeyAddress(recipientKey.publicKey, 0, true).toString();
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "makeTranfer";
    requestContract.state.data.method_args = [10, recipientAddress];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.error === "Wallet is empty");

    await netClient.shutdown();
    await ubotClient.shutdown();

    if (LOCAL_UBOTS)
        await shutdownUBots(ubotMains);
});

unit.test("ubot_wallet_test: insufficient balance", async () => {
    let ubotMains = [];
    if (LOCAL_UBOTS)
        ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    // test token
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("100"));

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

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "100");

    // make transfer
    let recipientKey = tk.TestKeys.getKey();
    let recipientAddress = new crypto.KeyAddress(recipientKey.publicKey, 0, true).toString();
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "makeTranfer";
    requestContract.state.data.method_args = [101, recipientAddress];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.error === "Insufficient funds");

    // check balance
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getBalance";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "100");

    // check last operation
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getLastOperation";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.operation === "put" && state.result.amount === "100");

    await netClient.shutdown();
    await ubotClient.shutdown();

    if (LOCAL_UBOTS)
        await shutdownUBots(ubotMains);
});

unit.test("ubot_wallet_test: put incompatible token", async () => {
    let ubotMains = [];
    if (LOCAL_UBOTS)
        ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let walletKey = tk.TestKeys.getKey();
    let walletContract = await wallet.createWallet(walletKey, 10, 12);

    console.log("Register wallet...");
    let ir = await netClient.register(await walletContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // test token
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));

    console.log("Register base token...");
    ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // test incompatible token
    let incompatibleTokenIssuerKey = tk.TestKeys.getKey();
    let incompatibleTokenContract = await cs.createTokenContract([incompatibleTokenIssuerKey],
        [incompatibleTokenIssuerKey.publicKey], new BigDecimal("100"));

    console.log("Register incompatible token...");
    ir = await netClient.register(await incompatibleTokenContract.getPackedTransaction(), 10000);
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

    // attempt put incompatible token into wallet
    packedToken = await wallet.prepareToken(walletContract, incompatibleTokenContract, [incompatibleTokenIssuerKey]);

    requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "putTokenIntoWallet";
    requestContract.state.data.method_args = [packedToken];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val &&
        state.result.error === "Invalid token currency, does not match value of join match field: state.origin");

    // check balance
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getBalance";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === "1000");

    await netClient.shutdown();
    await ubotClient.shutdown();

    if (LOCAL_UBOTS)
        await shutdownUBots(ubotMains);
});

unit.test("ubot_wallet_test: many operations", async () => {
    let ubotMains = [];
    if (LOCAL_UBOTS)
        ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    // test token
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));

    console.log("Register base token...");
    let ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    let splitKeys = [];
    let splits = [];

    for (let i = 0; i < 3; i++) {
        tokenContract = await cs.createSplit(tokenContract, 200 + i * 100, "amount", [tokenIssuerKey], true);
        let splitToken = Array.from(tokenContract.newItems)[0];
        let splitKey = tk.TestKeys.getKey();

        splitToken.registerRole(new roles.SimpleRole("owner", splitKey, splitToken));
        splitToken.registerRole(new roles.RoleLink("creator", "owner", splitToken));

        await splitToken.seal();
        await splitToken.addSignatureToSeal(splitKey);
        await tokenContract.seal();

        splitKeys.push(splitKey);
        splits.push(splitToken);

        console.log("Register split " + (i + 1) + "...");
        ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);
        assert(ir.state === ItemState.APPROVED);
    }

    let walletKey = tk.TestKeys.getKey();
    let walletContract = await wallet.createWallet(walletKey, 10, 12);

    console.log("Register wallet...");
    ir = await netClient.register(await walletContract.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // put tokens into wallet
    let expectedBalance = 0;
    for (let i = 0; i < 3; i++) {
        let packedToken = await wallet.prepareToken(walletContract, splits[i], [splitKeys[i]]);

        let requestContract = Contract.fromPrivateKey(userPrivKey);
        requestContract.state.data.method_name = "putTokenIntoWallet";
        requestContract.state.data.method_args = [packedToken];
        requestContract.state.data.executable_contract_id = walletContract.id;

        await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

        console.log("State: " + JSON.stringify(state));

        let amount = 200 + i * 100;
        expectedBalance += amount;
        assert(state.state === UBotPoolState.FINISHED.val && state.result === expectedBalance.toString());

        // check last operation
        requestContract = Contract.fromPrivateKey(walletKey);
        requestContract.state.data.method_name = "getLastOperation";
        requestContract.state.data.executable_contract_id = walletContract.id;

        await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

        console.log("State: " + JSON.stringify(state));

        assert(state.state === UBotPoolState.FINISHED.val && state.result.operation === "put" &&
            state.result.amount === amount.toString());
    }

    // make transfers
    for (let i = 0; i < 5; i++) {
        let recipientKey = tk.TestKeys.getKey();
        let recipientAddress = new crypto.KeyAddress(recipientKey.publicKey, 0, true).toString();
        let amount = 10 * (i + 10);
        expectedBalance -= amount;
        let requestContract = Contract.fromPrivateKey(walletKey);
        requestContract.state.data.method_name = "makeTranfer";
        requestContract.state.data.method_args = [amount, recipientAddress];
        requestContract.state.data.executable_contract_id = walletContract.id;

        await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

        console.log("State: " + JSON.stringify(state));

        assert(state.state === UBotPoolState.FINISHED.val && state.result instanceof Uint8Array);

        let transfer = await Contract.fromSealedBinary(state.result);
        assert(transfer.state.data.amount === amount.toString());

        // check balance
        requestContract = Contract.fromPrivateKey(walletKey);
        requestContract.state.data.method_name = "getBalance";
        requestContract.state.data.executable_contract_id = walletContract.id;

        await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

        console.log("State: " + JSON.stringify(state));

        assert(state.state === UBotPoolState.FINISHED.val && state.result === expectedBalance.toString());

        // check last operation
        requestContract = Contract.fromPrivateKey(walletKey);
        requestContract.state.data.method_name = "getLastOperation";
        requestContract.state.data.executable_contract_id = walletContract.id;

        await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, [
                "this.state.data.executable_contract_id == ref.id",
                "this can_perform ref.state.roles.walletOwner"
            ], true);

        state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

        console.log("State: " + JSON.stringify(state));

        assert(state.state === UBotPoolState.FINISHED.val && state.result.operation === "transfer" &&
            state.result.amount === amount.toString() && state.result.recipient === recipientAddress);

        // check transfer token
        transfer = await transfer.createRevision([recipientKey]);
        transfer.registerRole(new roles.SimpleRole("owner", userPrivKey, transfer));
        await transfer.seal(true);

        console.log("Change owner of transfer token...");
        ir = await netClient.register(await transfer.getPackedTransaction(), 10000);
        assert(ir.state === ItemState.APPROVED);
    }

    // put token into wallet
    let packedToken = await wallet.prepareToken(walletContract, tokenContract, [tokenIssuerKey]);
    let amount = Number(tokenContract.state.data.amount);
    expectedBalance += amount;

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "putTokenIntoWallet";
    requestContract.state.data.method_args = [packedToken];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === expectedBalance.toString());

    // make transfer
    let recipientKey = tk.TestKeys.getKey();
    let recipientAddress = new crypto.KeyAddress(recipientKey.publicKey, 0, true).toString();
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "makeTranfer";
    requestContract.state.data.method_args = [333, recipientAddress];
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result instanceof Uint8Array);

    let transfer = await Contract.fromSealedBinary(state.result);
    assert(transfer.state.data.amount === "333");
    expectedBalance -= 333;

    // check balance
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getBalance";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result === expectedBalance.toString());

    // check last operation
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getLastOperation";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.operation === "transfer" &&
        state.result.amount === "333" && state.result.recipient === recipientAddress);

    // check transfer token
    transfer = await transfer.createRevision([recipientKey]);
    transfer.registerRole(new roles.SimpleRole("owner", userPrivKey, transfer));
    await transfer.seal(true);

    console.log("Change owner of transfer token...");
    ir = await netClient.register(await transfer.getPackedTransaction(), 10000);
    assert(ir.state === ItemState.APPROVED);

    // check all operations
    requestContract = Contract.fromPrivateKey(walletKey);
    requestContract.state.data.method_name = "getOperations";
    requestContract.state.data.executable_contract_id = walletContract.id;

    await cs.addConstraintToContract(requestContract, walletContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, [
            "this.state.data.executable_contract_id == ref.id",
            "this can_perform ref.state.roles.walletOwner"
        ], true);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(4), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val && state.result.length === 10 &&
        state.result[0].operation === "put" && state.result[0].amount === "200" &&
        state.result[1].operation === "put" && state.result[1].amount === "300" &&
        state.result[2].operation === "put" && state.result[2].amount === "400" &&
        state.result[3].operation === "transfer" && state.result[3].amount === "100" &&
        state.result[4].operation === "transfer" && state.result[4].amount === "110" &&
        state.result[5].operation === "transfer" && state.result[5].amount === "120" &&
        state.result[6].operation === "transfer" && state.result[6].amount === "130" &&
        state.result[7].operation === "transfer" && state.result[7].amount === "140" &&
        state.result[8].operation === "put" && state.result[8].amount === "100" &&
        state.result[9].operation === "transfer" && state.result[9].amount === "333");

    await netClient.shutdown();
    await ubotClient.shutdown();

    if (LOCAL_UBOTS)
        await shutdownUBots(ubotMains);
});