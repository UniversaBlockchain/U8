/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as tk from "unit_tests/test_keys";

const UBotClient = require('ubot/ubot_client').UBotClient;
const ItemState = require("itemstate").ItemState;
const cs = require("contractsservice");
const BigDecimal  = require("big").Big;
const tt = require("test_tools");
const Contract = require('contract').Contract;
const UnsContract = require('services/unsContract').UnsContract;

const TOPOLOGY_ROOT = "../test/ubot/topology/";
const TOPOLOGY_FILE = "universa.pro.json";      //"mainnet_topology.json";
const userPrivKey = tk.TestKeys.getKey();

async function createPayment(cost) {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let U = await tt.createFreshU(100000000, [userPrivKey.publicKey]);
    U.registerRole(new roles.SimpleRole("issuer", tk.getTestKey().longAddress));
    await U.seal(true);

    await U.addSignatureToSeal(tk.getTestKey());
    let ir = await netClient.register(await U.getPackedTransaction(), 10000);

    if (ir.state !== ItemState.APPROVED)
        throw new Error("Error createPayment: item state = " + ir.state.val);

    U = await U.createRevision([userPrivKey]);
    U.state.data.transaction_units = U.state.data.transaction_units - cost;
    await U.seal();

    await netClient.shutdown();

    return U;
}

unit.test("uns_test: registerUNS", async () => {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let uns = UnsContract.fromPrivateKey(userPrivKey);

    uns.nodeInfoProvider = await netClient.getConfigProvider();

    // console.log("uns.nodeInfoProvider = " + JSON.stringify(uns.nodeInfoProvider));

    let keyToRegister = tk.TestKeys.getKey();
    let authorizedNameServiceKey = tk.TestKeys.getKey();        // TODO
    let name = "Trust" + Date.now();
    let desc = "Trust test";
    uns.addName(name,name + "_reduced", desc);
    uns.addKey(keyToRegister.publicKey);
    uns.keysToSignWith.add(authorizedNameServiceKey);
    uns.keysToSignWith.add(keyToRegister);

    let plannedExpirationDate = new Date();
    plannedExpirationDate.setMonth(plannedExpirationDate.getMonth() + 12);

    let parcel = await uns.createRegistrationParcelFromExpirationDate(plannedExpirationDate, await createPayment(100),
        [userPrivKey], [userPrivKey, authorizedNameServiceKey, keyToRegister]);

    let ir = await netClient.registerParcelWithState(await parcel.pack(), 8000);

    // let tokenIssuerKey = tk.TestKeys.getKey();
    // let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));
    //
    // cs.createUnsContractForRegisterContractName()
    //
    // let ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);

    if (ir.state === ItemState.APPROVED)
        console.log("UNS contract registered");
    else
        console.log("Error: item state = " + ir.state.val);

    await netClient.shutdown();

    return 0;
});