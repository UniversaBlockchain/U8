import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const UnsContract = require("services/unsContract").UnsContract;
const tt = require("test_tools");
const Config = require("config").Config;
const UnsName = require("services/unsName").UnsName;
const UnsRecord = require("services/unsRecord").UnsRecord;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;

unit.test("uns_test: goodUnsContract", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let randomPrivKey = await crypto.PrivateKey.generate(2048);

    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed;

    let referencesContract = Contract.fromPrivateKey(key);
    await referencesContract.seal(true);
    assert(await referencesContract.check());

    let paymentDecreased = await createUnsPayment();
    let unsContract = UnsContract.fromPrivateKey(key);
    let reducedName = "testUnsContract" + Math.floor(Date.now() / 1000);

    let unsName = new UnsName(reducedName, "test description", "http://test.com");
    unsName.unsReducedName = reducedName;
    unsName.unsDescription = "test description modified";
    unsName.unsURL = "http://test_modified.com";

    let unsRecord1 = UnsRecord.fromKey(randomPrivKey.publicKey);
    let unsRecord2 = UnsRecord.fromOrigin(referencesContract.id);

    unsName.addUnsRecord(unsRecord1);
    unsName.addUnsRecord(unsRecord2);
    unsContract.unsName = unsName;
    unsContract.addOriginContract(referencesContract);

    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
    unsContract.newItems.add(paymentDecreased);

    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.keysToSignWith.add(randomPrivKey);

    await unsContract.seal(true);
    assert(await unsContract.check());

    assert(NSmartContract.SmartContractType.UNS1 === unsContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === unsContract.get("definition.extended_type"));

    assert(unsContract instanceof UnsContract);
    assert(unsContract instanceof NSmartContract);

    let mdp = unsContract.definition.permissions.get("modify_data");
    assert(mdp !== 0);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    /*assert(unsContract.getUnsName(reducedName).unsReducedName === reducedName);                              //TODO
    assert(unsContract.getUnsName(reducedName).unsDescription === "test description modified");
    assert(unsContract.getUnsName(reducedName).unsURL === "http://test_modified.com");

    assert(unsContract.getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()) !== -1); //TODO
    assert(unsContract.getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.publicKey()) !== -1);
    //assert(unsContract.getUnsName(reducedName).findUnsRecordByAddress(new crypto.KeyAddress(randomPrivKey.publicKey, 0, true)) !== -1); */
});

unit.test("uns_test: goodUnsContractFromDSL", async () => {
    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed;

    let paymentDecreased = await createUnsPayment();

    let unsContract = await UnsContract.fromDslFile("../test/services/simple_uns_contract.yml");
    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    unsContract.keysToSignWith.add(key);
    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.newItems.add(paymentDecreased);

    await unsContract.seal(true);
    assert(await unsContract.check());

    assert(NSmartContract.SmartContractType.UNS1 === unsContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === unsContract.get("definition.extended_type"));

    assert(unsContract instanceof UnsContract);
    assert(unsContract instanceof NSmartContract);
});

unit.test("uns_test: serializeUnsContract", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let randomPrivKey = await crypto.PrivateKey.generate(2048);

    let authorizedNameServiceKey = tk.TestKeys.getKey();
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed;

    let referencesContract = Contract.fromPrivateKey(key);
    await referencesContract.seal(true);
    assert(await referencesContract.check());

    let paymentDecreased = await createUnsPayment();

    let unsContract = await UnsContract.fromPrivateKey(key);

    let reducedName = "testUnsContract" + Math.floor(Date.now() / 1000);
    let unsName = new UnsName(reducedName, "test description", "http://test.com");
    unsName.unsReducedName = reducedName;

    let unsRecord1 = UnsRecord.fromKey(randomPrivKey.publicKey);
    let unsRecord2 = UnsRecord.fromOrigin(referencesContract.id);
    unsName.addUnsRecord(unsRecord1);
    unsName.addUnsRecord(unsRecord2);
    unsContract.unsName = unsName;
    unsContract.addOriginContract(referencesContract);

    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
    unsContract.newItems.add(paymentDecreased);

    unsContract.keysToSignWith.add(authorizedNameServiceKey);
    unsContract.keysToSignWith.add(randomPrivKey);

    await unsContract.seal(true);
    assert(await unsContract.check());

    let b = BossBiMapper.getInstance().serialize(unsContract);
    let b2 = DefaultBiMapper.getInstance().serialize(unsContract);

    let desContract = BossBiMapper.getInstance().deserialize(b);
    let desContract2 = DefaultBiMapper.getInstance().deserialize(b2);

    //tt.assertSameContracts(desContract, unsContract); // TODO
    //tt.assertSameContracts(desContract2, unsContract);

    assert(NSmartContract.SmartContractType.UNS1 === desContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === desContract.get("definition.extended_type"));

    assert(desContract instanceof UnsContract);
    assert(desContract instanceof NSmartContract);

    let mdp = desContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    /*assert(desContract.getUnsName(reducedName).getUnsReducedName(), reducedName);
    assertEquals(((UnsContract)desContract).getUnsName(reducedName).getUnsDescription(), "test description");
    assertEquals(((UnsContract)desContract).getUnsName(reducedName).getUnsURL(), "http://test.com");

    assertNotEquals(((UnsContract)desContract).getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
    assertNotEquals(((UnsContract)desContract).getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
    assertNotEquals(((UnsContract)desContract).getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);*/

    mdp = desContract2.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    /*assert(desContract2.getUnsName(reducedName).getUnsReducedName(), reducedName);
    assertEquals(((UnsContract)desContract2).getUnsName(reducedName).getUnsDescription(), "test description");
    assertEquals(((UnsContract)desContract2).getUnsName(reducedName).getUnsURL(), "http://test.com");

    assertNotEquals(((UnsContract)desContract2).getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
    assertNotEquals(((UnsContract)desContract2).getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
    assertNotEquals(((UnsContract)desContract2).getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);*/


    let copiedUns = unsContract.copy();

    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.get("definition.extended_type"));

    assert(copiedUns instanceof UnsContract);
    assert(copiedUns instanceof NSmartContract);

    mdp = copiedUns.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));

    /*assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsReducedName(), reducedName);
    assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsDescription(), "test description");
    assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsURL(), "http://test.com");

    assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
    assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
    assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);*/
});

async function createUnsPayment() {
    let ownerKey = new crypto.PrivateKey(await (await io.openRead("../test/keys/stepan_mamontov.private.unikey")).allBytes());

    let unsU = await tt.createFreshU(100000000, [ownerKey.publicKey]);
    let paymentDecreased = unsU.createRevision([ownerKey]);

    paymentDecreased.state.data.transaction_units = unsU.state.data.transaction_units - 2000;
    await paymentDecreased.seal(true);

    return paymentDecreased;
}