/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as tk from "unit_tests/test_keys";

const UBotClient = require('ubot/ubot_client').UBotClient;
const ItemState = require("itemstate").ItemState;
const tt = require("test_tools");
const UnsContract = require('services/unsContract').UnsContract;
const NSmartContract = require("services/NSmartContract").NSmartContract;

const TOPOLOGY_ROOT = "../test/ubot/topology/";
const TOPOLOGY_FILE = "universa.pro.json";      //"mainnet_topology.json";
const userPrivKey = tk.TestKeys.getKey();

async function createU() {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let U = await tt.createFreshU(100000000, [userPrivKey.publicKey]);
    U.registerRole(new roles.SimpleRole("issuer", tk.getTestKey().longAddress));
    await U.seal(true);

    await U.addSignatureToSeal(tk.getTestKey());

    let ir = await netClient.register(await U.getPackedTransaction(), 10000);
    if (ir.state !== ItemState.APPROVED)
        throw new Error("Error createPayment: item state = " + ir.state.val);

    await netClient.shutdown();

    return U;
}

unit.test("uns_test: registerUNS", async () => {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let uns = UnsContract.fromPrivateKey(userPrivKey);

    uns.nodeInfoProvider = await netClient.getConfigProvider();

    let keyToRegister = await crypto.PrivateKey.generate(2048);
    let authorizedNameServiceKey = tk.getTestKey();
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

    let ir = await netClient.registerParcelWithState(await parcel.pack(), 20000);
    assert(ir.state === ItemState.APPROVED);

    // let irx = await netClient.getState(parcel.getPaymentContract().id);
    // console.log("Payload: " + JSON.stringify(ir));
    // console.log("Payment: " + JSON.stringify(irx));

    let packedUNS = await netClient.queryNameContract(name, NSmartContract.SmartContractType.UNS1);

    assert(packedUNS != null);

    let storedUNS = await Contract.fromSealedBinary(packedUNS);

    assert(storedUNS.id.equals(uns.id));
    assert(Array.from(storedUNS.getAddresses()).every(a => a.match(keyToRegister.publicKey)));

    await netClient.shutdown();

    return 0;
});