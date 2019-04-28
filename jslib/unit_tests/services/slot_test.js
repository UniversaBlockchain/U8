import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const NSmartContract = require("services/NSmartContract").NSmartContract;
const SlotContract = require("services/slotContract").SlotContract;
const tt = require("test_tools");

unit.test("slot_test: goodSlotContract", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = await createSlotPayment();

    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = nodeInfoProvider;
    slotContract.newItems.add(paymentDecreased);

     await slotContract.seal(true);
     assert(await simpleContract.check());

     /*assert(NSmartContract.SmartContractType.SLOT1 === slotContract.definition.extendedType);

     let permissions = slotContract.definition.permission;

     let mdp = permissions.get("modify_data");
     assert(mdp !== null);
     assert((mdp.iterator().next()).getFields().containsKey("action")); //TODO

     assert(simpleContract.id === slotContract.getTrackingContract().id);
     assert(simpleContract.id === TransactionPack.unpack(slotContract.getPackedTrackingContract()).getContract.id);

    /* let trackingHashesAsBase64 = slotContract.state.data("tracking_contract"); //TODO

     for (let k of trackingHashesAsBase64.keySet()) {
         let packed = trackingHashesAsBase64.getBinary(k);
         if (packed != null) {
             let c = Contract.fromPackedTransaction(packed);
             assert(simpleContract.id, c.id);
         }
     }*/
});


/*unit.test("slot_test: goodSlotContractFromDSL", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = createSlotPayment(); //TODO

    let slotContract = SlotContract.fromDslFile("../test/services/SlotDSLTemplate.yml");
    await slotContract.addSignatureToSeal(key);

    assert(slotContract instanceof SlotContract);

    slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = nodeInfoProvider;
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(NSmartContract.SmartContractType.SLOT1 === slotContract.definition.extendedType);

    assert(2 === slotContract.keepRevisions);

    //Multimap<String, Permission> permissions = slotContract.definition.permissions;

    //Collection<Permission> mdp = permissions.get("modify_data");

    assert(mdp !== null);
    //assert(mdp.iterator().next()).getFields().containsKey("action") === true); //TODO

    assert(simpleContract.id === slotContract.getTrackingContract().id);
    assert(simpleContract.id === TransactionPack.unpack(slotContract.getPackedTrackingContract()).getContract().id);

    let trackingHashesAsBase64 = slotContract.state.data("tracking_contract");

    for (let k : trackingHashesAsBase64.keySet()) {
        let packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            let c = Contract.fromPackedTransaction(packed);
            assert(simpleContract.id, c.id);
        }
    }
});

unit.test("slot_test: serializeSlotContract", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = createSlotPayment();

    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = nodeInfoProvider;
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    //Binder b = BossBiMapper.serialize(smartContract);
    let desContract = DefaultBiMapper.deserialize(b);

    assertSameContracts(slotContract, desContract); //TODO
    assert(NSmartContract.SmartContractType.SLOT1 === desContract.definition.extendedType);

    assert(desContract instanceof SlotContract);

    //Multimap<String, Permission> permissions = desContract.definition.permissions;
    //Collection<Permission> mdp = permissions.get("modify_data");
    assert(mdp !== null);
   // assertTrue((mdp.iterator().next()).getFields().containsKey("action")); //TODO

    assert(simpleContract.id === desContract.getTrackingContract().id);
    assert(simpleContract.id === TransactionPack.unpack(desContract.getPackedTrackingContract()).getContract().id);

    Binder trackingHashesAsBase64 = desContract.getStateData().getBinder("tracking_contract"); //TODO


    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }

    let copiedContract = slotContract.copy();

    //assertSameContracts(slotContract, copiedContract);
    assert(NSmartContract.SmartContractType.SLOT1 === copiedContract.definition.extendedType);
    assert(NSmartContract.SmartContractType.SLOT1 === copiedContract.get("definition.extended_type"));
    assert(copiedContract instanceof SlotContract);

    let permissions = copiedContract.definition.permissions;
    let mdp = permissions.get("modify_data");
    assert(mdp !== 0);
    //assert((mdp.iterator().next()).getFields().containsKey("action") === true);

    assert(simpleContract.id === copiedContract.getTrackingContract().id);
    assert(simpleContract.id === TransactionPack.unpack(copiedContract.getPackedTrackingContract()).getContract().id);

    /*trackingHashesAsBase64 = copiedContract.getStateData().getBinder("tracking_contract"); //TODO
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }
});

unit.test("slot_test: keepRevisions", async () => {
    let nodeInfoProvider = tt.createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    let paymentDecreased = createSlotPayment();

    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider(nodeInfoProvider);
    slotContract.setKeepRevisions(2);
    slotContract.newItems.add(paymentDecreased);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(1 === slotContract.trackingContracts().size());              //TODO
    assert(simpleContract.id === slotContract.getTrackingContract().id);
    assert(simpleContract.id(), TransactionPack.unpack(slotContract.getPackedTrackingContract()).getContract().id);

    Binder trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }

    let simpleContract2 = simpleContract.createRevision(key);
    await simpleContract2.seal(true);

    slotContract.putTrackingContract(simpleContract2);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(2 === slotContract.trackingContracts.size());            //TODO
    assert(simpleContract2.id, smartContract.getTrackingContract().id);
    assert(simpleContract2.id, TransactionPack.unpack(smartContract.getPackedTrackingContract()).getContract().id);

    trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertThat(c.getId(), Matchers.anyOf(equalTo(simpleContract.getId()), equalTo(simpleContract2.getId())));
        }
    }

    let simpleContract3 = simpleContract2.createRevision(key);

    await simpleContract3.seal(true);

    slotContract.putTrackingContract(simpleContract3);

    await slotContract.seal(true);
    assert(await slotContract.check());

    assert(2 === slotContract.trackingContracts().size());
    assert(simpleContract3.id === slotContract.getTrackingContract().id);
    assert(simpleContract3.id() === TransactionPack.unpack(slotContract.getPackedTrackingContract()).getContract().id());

    //trackingHashesAsBase64 = slotContract.state.data.getBinder("tracking_contract"); //TODO
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertThat(c.getId(), Matchers.anyOf(
                equalTo(simpleContract.getId()),
                equalTo(simpleContract2.getId()),
                equalTo(simpleContract3.getId())
            ));
        }
    }
});
*/

async function createSlotPayment() {
    let ownerKey = new crypto.PrivateKey(await (await io.openRead("../test/keys/stepan_mamontov.private.unikey")).allBytes());

    let slotU = await tt.createFreshU(100000000, [ownerKey.publicKey]);
    let paymentDecreased = slotU.createRevision([ownerKey]);
    paymentDecreased.state.data.transaction_units = slotU.state.data.transaction_units - 100;

    await paymentDecreased.seal(true);

    return paymentDecreased;
}

