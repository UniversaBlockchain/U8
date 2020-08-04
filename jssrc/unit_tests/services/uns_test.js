/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const UnsContract = require("services/unsContract").UnsContract;
const tt = require("test_tools");
const Config = require("config").Config;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const Contract = require("contract").Contract;

unit.test("uns_test: goodUnsContract", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let randomPrivKey = tk.TestKeys.getKey();

    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterAddress = authorizedNameServiceKey.publicKey.longAddress;

    let constraintsContract = Contract.fromPrivateKey(key);
    await constraintsContract.seal(true);
    assert(await constraintsContract.check());

    let paymentDecreased = await createUnsPayment();
    let unsContract = UnsContract.fromPrivateKey(key);
    let reducedName = "testUnsContract" + Date.now();

    unsContract.addName(reducedName,reducedName,"test description");
    unsContract.addKey(randomPrivKey.publicKey);
    unsContract.addOriginFromContract(constraintsContract);

    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
    unsContract.newItems.add(paymentDecreased);

    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.keysToSignWith.add(randomPrivKey);

    unsContract.setPayingAmount(1460);

    await unsContract.seal(true);
    assert(await unsContract.check());

    assert(NSmartContract.SmartContractType.UNS1 === unsContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === unsContract.get("definition.extended_type"));

    assert(unsContract instanceof UnsContract);

    let mdp = unsContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(unsContract.getName(reducedName).unsReducedName === reducedName);
    assert(unsContract.getName(reducedName).unsDescription === "test description");

    assert(unsContract.getOrigins().has(constraintsContract.getOrigin()));
    assert(unsContract.getAddresses().has(randomPrivKey.publicKey.longAddress));
    assert(unsContract.getAddresses().has(randomPrivKey.publicKey.shortAddress));
});

unit.test("uns_test: goodUnsContractFromDSL", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterAddress = authorizedNameServiceKey.publicKey.longAddress;

    let paymentDecreased = await createUnsPayment();

    let unsContract = await UnsContract.fromDslFile("../test/services/UnsDSLTemplate.yml");
    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();

    unsContract.keysToSignWith.add(key);
    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.newItems.add(paymentDecreased);

    await unsContract.seal(true);
    assert(await unsContract.check());

    assert(NSmartContract.SmartContractType.UNS1 === unsContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === unsContract.get("definition.extended_type"));

    assert(unsContract instanceof UnsContract);

    let mdp = unsContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));
});

unit.test("uns_test: serializeUnsContract", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let randomPrivKey = tk.TestKeys.getKey();

    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed;

    let constraintsContract = Contract.fromPrivateKey(key);
    await constraintsContract.seal(true);
    assert(await constraintsContract.check());

    let paymentDecreased = await createUnsPayment();

    let unsContract = await UnsContract.fromPrivateKey(key);

    let reducedName = "testUnsContract" + Date.now();

    unsContract.addName(reducedName,reducedName,"test description");
    unsContract.addKey(randomPrivKey.publicKey);
    unsContract.addOriginFromContract(constraintsContract);

    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
    unsContract.newItems.add(paymentDecreased);

    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.keysToSignWith.add(randomPrivKey);

    await unsContract.seal(true);
    assert(await unsContract.check());

    let b = await BossBiMapper.getInstance().serialize(unsContract);
    let b2 = await DefaultBiMapper.getInstance().serialize(unsContract);

    let desContract = await BossBiMapper.getInstance().deserialize(b);
    let desContract2 = await DefaultBiMapper.getInstance().deserialize(b2);

    await tt.assertSameContracts(desContract, unsContract);
    await tt.assertSameContracts(desContract2, unsContract);

    assert(NSmartContract.SmartContractType.UNS1 === desContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === desContract.get("definition.extended_type"));

    assert(desContract instanceof UnsContract);

    let mdp = desContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(desContract.getName(reducedName).unsReducedName === reducedName);
    assert(desContract.getName(reducedName).unsDescription === "test description");

    assert(desContract.getOrigins().has(constraintsContract.getOrigin()));
    assert(desContract.getAddresses().has(randomPrivKey.publicKey.longAddress));
    assert(desContract.getAddresses().has(randomPrivKey.publicKey.shortAddress));

    mdp = desContract2.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(desContract2.getName(reducedName).unsReducedName === reducedName);
    assert(desContract2.getName(reducedName).unsDescription === "test description");

    assert(desContract2.getOrigins().has(constraintsContract.getOrigin()));
    assert(desContract2.getAddresses().has(randomPrivKey.publicKey.longAddress));
    assert(desContract2.getAddresses().has(randomPrivKey.publicKey.shortAddress));

    let copiedUns = await unsContract.copy();

    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.get("definition.extended_type"));

    assert(copiedUns instanceof UnsContract);

    mdp = copiedUns.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(copiedUns.getName(reducedName).unsReducedName === reducedName);
    assert(copiedUns.getName(reducedName).unsDescription === "test description");

    assert(copiedUns.getOrigins().has(constraintsContract.getOrigin()));
    assert(copiedUns.getAddresses().has(randomPrivKey.publicKey.longAddress));
    assert(copiedUns.getAddresses().has(randomPrivKey.publicKey.shortAddress));
});

async function createUnsPayment() {
    let ownerKey = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/keys/test_payment_owner.private.unikey"));

    let unsU = await tt.createFreshU(100000000, [ownerKey.publicKey]);
    let paymentDecreased = await unsU.createRevision([ownerKey]);

    paymentDecreased.state.data.transaction_units = unsU.state.data.transaction_units - 2000;
    await paymentDecreased.seal(true);

    return paymentDecreased;
}