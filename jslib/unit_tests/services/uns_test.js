import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const UnsContract = require("services/unsContract").UnsContract;
const tt = require("test_tools");
const Config = require("config").Config;
const UnsName = require("services/unsName").UnsName;

/*unit.test("uns_test: goodUnsContract", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let randomPrivKey = await crypto.PrivateKey.generate(2048);

    let authorizedNameServiceKey = tk.TestKeys.getKey(3); //TODO
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.PublicKey.packed(); //TODO

    let referencesContract = Contract.fromPrivateKey(key);
    await referencesContract.seal(true);
    assert(await referencesContract.check());

    let paymentDecreased = createUnsPayment();

    let uns = UnsContract.fromPrivateKey(key);

    let reducedName = "testUnsContract" + Math.floor(Date.now() / 1000);

    let unsName = new UnsName(reducedName, "test description", "http://test.com");
    unsName.unsReducedName = reducedName;
    unsName.unsDescription = "test description modified";
    unsName.unsURL = "http://test_modified.com";

    let unsRecord1 = new UnsRecord(randomPrivKey.PublicKey);
    let unsRecord2 = new UnsRecord(referencesContract.id);
    unsName.addUnsRecord(unsRecord1);
    unsName.addUnsRecord(unsRecord2);
    uns.unsName = unsName;
    uns.addOriginContract(referencesContract); //TODO

    uns.nodeInfoProvider = nodeInfoProvider; //TODO
    uns.newItems.add(paymentDecreased);

    await uns.addSignatureToSeal(authorizedNameServiceKey);
    await uns.addSignatureToSeal(randomPrivKey);

    await uns.seal(true);
    assert(await uns.check());

    assert(NSmartContract.SmartContractType.UNS1 === uns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === uns.get("definition.extended_type"));

    assert(uns instanceof UnsContract);
    assert(uns instanceof NSmartContract);
    assert(uns instanceof NContract); //TODO

   // Multimap<String, Permission> permissions = uns.definition.permissions; //TODO
    //Collection<Permission> mdp = permissions.get("modify_data");

    assert(mdp !== 0);
    assert((mdp.iterator().next()).getFields().containsKey("action")); //TODO

    assert(uns.unsName(reducedName).getUnsReducedName(), reducedName);
    assertEquals(uns.getUnsName(reducedName).getUnsDescription(), "test description modified");
    assertEquals(uns.getUnsName(reducedName).getUnsURL(), "http://test_modified.com");

    assertNotEquals(uns.getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
    assertNotEquals(uns.getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
    assertNotEquals(uns.getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);
});

unit.test("uns_test: goodUnsContractFromDSL", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let authorizedNameServiceKey = tk.TestKeys.getKey(3); //TODO
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed();  //TODO

    let paymentDecreased = createUnsPayment();

    let uns = UnsContract.fromDslFile("../test/services/simple_uns_contract.yml");
    uns.nodeInfoProvider = nodeInfoProvider;
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    await uns.addSignatureToSeal(key);
    await uns.addSignatureToSeal(authorizedNameServiceKey);

    uns.newItems.add(paymentDecreased);
    await uns.seal(true);
    assert(await uns.check());

    assert(NSmartContract.SmartContractType.UNS1 === uns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === uns.get("definition.extended_type"));

    assert(uns instanceof UnsContract);
    assert(uns instanceof NSmartContract);
    //assert(uns instanceof NContract); //TODO
});

unit.test("uns_test: serializeUnsContract", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());
    let randomPrivKey = await crypto.PrivateKey.generate(2048);

    let authorizedNameServiceKey = tk.TestKeys.getKey(3); //TODO
    Config.authorizedNameServiceCenterKey = authorizedNameServiceKey.publicKey.packed();  //TODO

    let referencesContract = Contract.fromPrivateKey(key);
    await referencesContract.seal(true);
    assert(await referencesContract.check());

    let paymentDecreased = createUnsPayment();

    let uns = UnsContract.fromPrivateKey(key);

    let reducedName = "testUnsContract" + Math.floor(Date.now() / 1000);

    let unsName = new UnsName(reducedName, "test description", "http://test.com");
    unsName.unsReducedName = reducedName;
    let unsRecord1 = new UnsRecord(randomPrivKey.PublicKey);
    let unsRecord2 = new UnsRecord(referencesContract.id);
    unsName.addUnsRecord(unsRecord1);
    unsName.addUnsRecord(unsRecord2);
    uns.unsName = unsName;
    uns.addOriginContract(referencesContract);// TODO

    uns.nodeInfoProvider = nodeInfoProvider; //TODO
    uns.newItems.add(paymentDecreased);

    await uns.addSignatureToSeal(authorizedNameServiceKey);
    await uns.addSignatureToSeal(randomPrivKey);

    await uns.seal(true);
    assert(await uns.check());

    let b = BossBiMapper.serialize(uns);
    let desUns = DefaultBiMapper.deserialize(b);

    assert(NSmartContract.SmartContractType.UNS1 === desUns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === desUns.get("definition.extended_type"));

    assert(desUns instanceof UnsContract);
    assert(desUns instanceof NSmartContract);
    //assertTrue(desUns instanceof NContract); //TODO

    //Multimap<String, Permission> permissions = desUns.definition.permissions;
    //Collection<Permission> mdp = permissions.get("modify_data");

    assert(mdp !== null);
    assert((mdp.iterator().next()).getFields().containsKey("action")); //TODO

    assert(desUns.getUnsName(reducedName).getUnsReducedName(), reducedName);
    assertEquals(((UnsContract)desUns).getUnsName(reducedName).getUnsDescription(), "test description");
    assertEquals(((UnsContract)desUns).getUnsName(reducedName).getUnsURL(), "http://test.com");

    assertNotEquals(((UnsContract)desUns).getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
    assertNotEquals(((UnsContract)desUns).getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
    assertNotEquals(((UnsContract)desUns).getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);

    let copiedUns = uns.copy();

    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.definition.extendedType);
    assert(NSmartContract.SmartContractType.UNS1 === copiedUns.get("definition.extended_type"));

    assert(copiedUns instanceof UnsContract);
    assert(copiedUns instanceof NSmartContract);
    //assertTrue(copiedUns instanceof NContract); //TODO

     permissions = copiedUns.definition.permissions;
     mdp = permissions.get("modify_data");
     assertNotNull(mdp !== null);
     assert((mdp.iterator().next()).getFields().containsKey("action")); //TODO

     assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsReducedName(), reducedName);
     assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsDescription(), "test description");
     assertEquals(((UnsContract)copiedUns).getUnsName(reducedName).getUnsURL(), "http://test.com");

     assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByOrigin(referencesContract.getOrigin()), -1);
     assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByKey(randomPrivKey.getPublicKey()), -1);
     assertNotEquals(((UnsContract)copiedUns).getUnsName(reducedName).findUnsRecordByAddress(new KeyAddress(randomPrivKey.getPublicKey(), 0, true)), -1);
});
*/
async function createUnsPayment() {
    let ownerKey = new crypto.PrivateKey(await (await io.openRead("../test/keys/stepan_mamontov.private.unikey")).allBytes());

    let keys = new Set();
    keys.add(ownerKey.PublicKey); //TODO

    let stepaU = tt.createFreshU(100000000, keys);
    let paymentDecreased = stepaU.createRevision([ownerKey]);

    paymentDecreased.state.data.transaction_units = stepaU.state.data.transaction_units - 2000;
    await paymentDecreased.seal(true);

    return paymentDecreased;
}