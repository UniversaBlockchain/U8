/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, assertSilent, unit} from 'test'

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const Parcel = require("parcel").Parcel;
const Contract = require("contract").Contract;
const tk = require("unit_tests/test_keys");
const tt = require("test_tools");

async function createTestParcels() {
    let payload = Contract.fromPrivateKey(tk.TestKeys.getKey());
    payload.newItems.add(Contract.fromPrivateKey(tk.TestKeys.getKey()));
    await payload.seal(true);

    let payment = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await payment.seal(true);

    let parcel = new Parcel(payload.transactionPack, payment.transactionPack);

    let payloadFromFile = await Contract.fromDslFile("../test/simple_root_contract.yml");
    payloadFromFile.newItems.add(Contract.fromPrivateKey(tk.TestKeys.getKey()));
    payloadFromFile.keysToSignWith.add(tk.TestKeys.getKey());
    await payloadFromFile.seal(true);

    let paymentFromFile = await Contract.fromDslFile("../test/simple_root_contract.yml");
    paymentFromFile.keysToSignWith.add(tk.TestKeys.getKey());
    await paymentFromFile.seal(true);

    let parcelFromFile = new Parcel(payloadFromFile.transactionPack, paymentFromFile.transactionPack);

    return [parcel, parcelFromFile];
}

async function parcelAssertions(parcel1, parcel2) {
    assert(parcel1.hashId.equals(parcel2.hashId));

    assert(parcel1.payload.contract.id.equals(parcel2.payload.contract.id));
    assert(parcel1.payment.contract.id.equals(parcel2.payment.contract.id));

    assert(parcel1.payload.subItems.size === parcel2.payload.subItems.size);
    assert(parcel1.payload.referencedItems.size === parcel2.payload.referencedItems.size);
    assert(parcel1.payment.subItems.size === parcel2.payment.subItems.size);
    assert(parcel1.payment.referencedItems.size === parcel2.payment.referencedItems.size);

    await tt.assertSameContracts(parcel1.payload.contract, parcel2.payload.contract);
    await tt.assertSameContracts(parcel1.payment.contract, parcel2.payment.contract);

    for (let k of parcel1.payload.subItems.keys())
        await tt.assertSameContracts(parcel1.payload.subItems.get(k), parcel2.payload.subItems.get(k));

    for (let k of parcel1.payload.referencedItems.keys())
        await tt.assertSameContracts(parcel1.payload.referencedItems.get(k), parcel2.payload.referencedItems.get(k));

    for (let k of parcel1.payment.subItems.keys())
        await tt.assertSameContracts(parcel1.payment.subItems.get(k), parcel2.payment.subItems.get(k));

    for (let k of parcel1.payment.referencedItems.keys())
        await tt.assertSameContracts(parcel1.payment.referencedItems.get(k), parcel2.payment.referencedItems.get(k));
}

unit.test("parcel_test: serializeDeserialize", async () => {
    let [parcel, parcelFromFile] = await createTestParcels();

    let p1 = await BossBiMapper.getInstance().serialize(parcel);
    let p2 = await DefaultBiMapper.getInstance().serialize(parcel);
    let pf1 = await BossBiMapper.getInstance().serialize(parcelFromFile);
    let pf2 = await DefaultBiMapper.getInstance().serialize(parcelFromFile);

    let desParcel1 = await BossBiMapper.getInstance().deserialize(p1);
    let desParcel2 = await DefaultBiMapper.getInstance().deserialize(p2);
    let desParcelFromFile1 = await BossBiMapper.getInstance().deserialize(pf1);
    let desParcelFromFile2 = await DefaultBiMapper.getInstance().deserialize(pf2);

    await parcelAssertions(parcel, desParcel1);
    await parcelAssertions(parcel, desParcel2);
    await parcelAssertions(parcelFromFile, desParcelFromFile1);
    await parcelAssertions(parcelFromFile, desParcelFromFile2);

    assert(desParcel1.payload.subItems.size === 1);
    assert(desParcel1.payload.contract.newItems.size === 1);
    assert(desParcel1.getPayloadContract().newItems.size === 1);

    assert(desParcel2.payload.subItems.size === 1);
    assert(desParcel2.payload.contract.newItems.size === 1);
    assert(desParcel2.getPayloadContract().newItems.size === 1);

    assert(desParcelFromFile1.payload.subItems.size === 1);
    assert(desParcelFromFile1.payload.contract.newItems.size === 1);
    assert(desParcelFromFile1.getPayloadContract().newItems.size === 1);

    assert(desParcelFromFile2.payload.subItems.size === 1);
    assert(desParcelFromFile2.payload.contract.newItems.size === 1);
    assert(desParcelFromFile2.getPayloadContract().newItems.size === 1);
});

unit.test("parcel_test: packUnpack", async () => {
    let [parcel, parcelFromFile] = await createTestParcels();

    let desParcel = await Parcel.unpack(await parcel.pack());
    let desParcelFromFile = await Parcel.unpack(await parcelFromFile.pack());

    await parcelAssertions(parcel, desParcel);
    await parcelAssertions(parcelFromFile, desParcelFromFile);

    assert(desParcel.payload.subItems.size === 1);
    assert(desParcel.payload.contract.newItems.size === 1);
    assert(desParcel.getPayloadContract().newItems.size === 1);

    assert(desParcelFromFile.payload.subItems.size === 1);
    assert(desParcelFromFile.payload.contract.newItems.size === 1);
    assert(desParcelFromFile.getPayloadContract().newItems.size === 1);
});