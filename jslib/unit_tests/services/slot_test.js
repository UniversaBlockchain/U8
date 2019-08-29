/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const SlotContract = require("services/slotContract").SlotContract;
const tt = require("test_tools");
const BossBiMapper = require("bossbimapper").BossBiMapper;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;

unit.test("slot_test: goodSlotContract", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);

    assert(await simpleContract.check());

    let paymentDecreased = await createSlotPayment();
    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    await slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = tt.createNodeInfoProvider();
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await simpleContract.check());

    assert(NSmartContract.SmartContractType.SLOT1 === slotContract.definition.extendedType);

    let mdp = slotContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(simpleContract.id.equals(slotContract.getTrackingContract().id));
    assert(simpleContract.id.equals((await TransactionPack.unpack(slotContract.getPackedTrackingContract())).contract.id));

    let trackingHashesAsBase64 = slotContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64);
        assert(simpleContract.id.equals((await Contract.fromPackedTransaction(binary)).id));
    }
});

unit.test("slot_test: goodSlotContractFromDSL", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let simpleContract = Contract.fromPrivateKey(key);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = await createSlotPayment();
    let slotContract = await SlotContract.fromDslFile("../test/services/SlotDSLTemplate.yml");
    slotContract.keysToSignWith.add(key);

    assert(slotContract instanceof SlotContract);

    await slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = tt.createNodeInfoProvider();
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(NSmartContract.SmartContractType.SLOT1 === slotContract.definition.extendedType);
    assert(2 === slotContract.keepRevisions);

    let mdp = slotContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(simpleContract.id.equals(slotContract.getTrackingContract().id));
    assert(simpleContract.id.equals((await TransactionPack.unpack(slotContract.getPackedTrackingContract())).contract.id));

    let trackingHashesAsBase64 = slotContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64);
        assert(simpleContract.id.equals((await Contract.fromPackedTransaction(binary)).id));
    }
});

unit.test("slot_test: serializeSlotContract", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let simpleContract = Contract.fromPrivateKey(key);

    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = await createSlotPayment();
    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    await slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = tt.createNodeInfoProvider();
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    let b = await BossBiMapper.getInstance().serialize(slotContract);
    let b2 = await DefaultBiMapper.getInstance().serialize(slotContract);

    let desContract = await BossBiMapper.getInstance().deserialize(b);
    let desContract2 = await DefaultBiMapper.getInstance().deserialize(b2);

    await tt.assertSameContracts(desContract, slotContract);
    await tt.assertSameContracts(desContract2, slotContract);

    assert(NSmartContract.SmartContractType.SLOT1 === desContract.definition.extendedType);

    assert(desContract instanceof SlotContract);
    assert(desContract2 instanceof SlotContract);

    let mdp = slotContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(simpleContract.id.equals(desContract.getTrackingContract().id));
    assert(simpleContract.id.equals((await TransactionPack.unpack(desContract.getPackedTrackingContract())).contract.id));

    let trackingHashesAsBase64 = desContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64);
        assert(simpleContract.id.equals((await Contract.fromPackedTransaction(binary)).id));
    }

    let copiedContract = await slotContract.copy();

    await tt.assertSameContracts(slotContract, copiedContract);

    assert(NSmartContract.SmartContractType.SLOT1 === copiedContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.SLOT1 === copiedContract.get("definition.extended_type"));
    assert(copiedContract instanceof SlotContract);

    mdp = copiedContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    assert(simpleContract.id.equals(copiedContract.getTrackingContract().id));
    assert(simpleContract.id.equals((await TransactionPack.unpack(copiedContract.getPackedTrackingContract())).contract.id));

    trackingHashesAsBase64 = copiedContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64);
        assert(simpleContract.id.equals((await Contract.fromPackedTransaction(binary)).id));
    }
});

unit.test("slot_test: keepRevisions", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = await createSlotPayment();
    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    await slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = tt.createNodeInfoProvider();
    slotContract.setKeepRevisions(2);
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(1 === slotContract.trackingContracts.length);
    assert(simpleContract.id.equals(slotContract.getTrackingContract().id));
    assert(simpleContract.id.equals((await TransactionPack.unpack(slotContract.getPackedTrackingContract())).contract.id));

    let trackingHashesAsBase64 = slotContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64);
        assert(simpleContract.id.equals((await Contract.fromPackedTransaction(binary)).id));
    }

    let simpleContract2 = await simpleContract.createRevision([key]);
    await simpleContract2.seal(true);

    await slotContract.putTrackingContract(simpleContract2);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(2 === slotContract.trackingContracts.length);
    assert(simpleContract2.id.equals(slotContract.getTrackingContract().id));
    assert(simpleContract2.id.equals((await TransactionPack.unpack(slotContract.getPackedTrackingContract())).contract.id));

    trackingHashesAsBase64 = slotContract.state.data["tracking_contract"];
    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64 || hash === simpleContract2.id.base64);
        let cid = (await Contract.fromPackedTransaction(binary)).id;
        assert(cid.equals(simpleContract.id) || cid.equals(simpleContract2.id));
    }

    let simpleContract3 = await simpleContract2.createRevision([key]);

    await simpleContract3.seal(true);

    await slotContract.putTrackingContract(simpleContract3);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(2 === slotContract.trackingContracts.length);
    assert(simpleContract3.id.equals(slotContract.getTrackingContract().id));
    assert(simpleContract3.id.equals((await TransactionPack.unpack(slotContract.getPackedTrackingContract())).contract.id));

    trackingHashesAsBase64 = slotContract.state.data["tracking_contract"];

    for (let [hash, binary] of Object.entries(trackingHashesAsBase64)) {
        assert(hash === simpleContract.id.base64 || hash === simpleContract2.id.base64 || hash === simpleContract3.id.base64);
        let cid = (await Contract.fromPackedTransaction(binary)).id;
        assert(cid.equals(simpleContract.id) || cid.equals(simpleContract2.id) || cid.equals(simpleContract3.id));
    }
});

async function createSlotPayment() {
    let ownerKey = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/keys/test_payment_owner.private.unikey"));

    let slotU = await tt.createFreshU(100000000, [ownerKey.publicKey]);
    let paymentDecreased = await slotU.createRevision([ownerKey]);
    paymentDecreased.state.data.transaction_units = slotU.state.data.transaction_units - 100;

    await paymentDecreased.seal(true);

    return paymentDecreased;
}
