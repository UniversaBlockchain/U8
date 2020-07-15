/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as tk from "unit_tests/test_keys";

const UBotClient = require('ubot/ubot_client').UBotClient;
const ItemState = require("itemstate").ItemState;
const tt = require("test_tools");
const UnsContract = require('services/unsContract').UnsContract;
const io = require("io");

const TOPOLOGY_ROOT = "../test/ubot/topology/";
const TOPOLOGY_FILE = "universa.pro.json";      //"mainnet_topology.json";
const userPrivKey = tk.TestKeys.getKey();

async function createU() {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let U = await tt.createFreshU(100000000, [userPrivKey.publicKey]);
    U.registerRole(new roles.SimpleRole("issuer", tk.getTestKey().longAddress));
    await U.seal(true);

    await U.addSignatureToSeal(tk.getTestKey());

    let pack = await U.getPackedTransaction();
    //await io.filePutContents("/home/dmitriy/U_07.unicon", pack);

    let ir = await netClient.register(pack, 10000);

    if (ir.state !== ItemState.APPROVED)
        throw new Error("Error createPayment: item state = " + ir.state.val);

    await netClient.shutdown();

    return U;
}

unit.test("uns_test: registerUNS", async () => {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let uns = UnsContract.fromPrivateKey(userPrivKey);

    uns.nodeInfoProvider = await netClient.getConfigProvider();

    let keyToRegister = tk.TestKeys.getKey();
    let authorizedNameServiceKey = tk.TestKeys.getKey();        // TODO
    let name = "Trust" + Date.now();
    let desc = "Trust test";
    uns.addName(name,name + "_reduced", desc);
    uns.addKey(keyToRegister.publicKey);
    uns.keysToSignWith.add(authorizedNameServiceKey);
    uns.keysToSignWith.add(keyToRegister);

    let plannedExpirationDate = new Date();
    plannedExpirationDate.setFullYear(plannedExpirationDate.getFullYear() + 1);

    let parcel = await uns.createRegistrationParcelFromExpirationDate(plannedExpirationDate, await createU(),
        [userPrivKey], [userPrivKey, authorizedNameServiceKey, keyToRegister]);

    let pack = await parcel.pack();
    //await io.filePutContents("/home/dmitriy/Parcel_07.uniparcel", pack);

    let ir = await netClient.registerParcelWithState(pack, 8000);
    let irx = await netClient.getState(parcel.getPaymentContract().id);

    console.log("!!!" + JSON.stringify(ir));
    console.log("!!!" + JSON.stringify(irx));
    console.log("!!!" + JSON.stringify(irx.errors.length));

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