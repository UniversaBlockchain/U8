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

    //let paymentDecreased = createSlotPayment(); //TODO

    let slotContract = SlotContract.fromPrivateKey(key);

    assert(slotContract instanceof SlotContract);

    slotContract.putTrackingContract(simpleContract);
    slotContract.nodeInfoProvider = nodeInfoProvider;
    /* slotContract.NewItems = paymentDecreased;

     await slotContract.seal(true);
     assert(await simpleContract.check());

     assert(NSmartContract.SmartContractType.SLOT1 === slotContract.definition.extendedType);

     let permissions = slotContract.definition.permission
     /*  let mdp = permissions.get("modify_data");
       assert(mdp !== null);
       assert((mdp.iterator().next()).getFields().containsKey("action"));

       assertEquals(simpleContract.getId(), ((SlotContract) slotContract).getTrackingContract().getId());
       assertEquals(simpleContract.getId(), TransactionPack.unpack(((SlotContract) slotContract).getPackedTrackingContract()).getContract().getId);

       /*Binder trackingHashesAsBase64 = slotContract.getStateData().getBinder("tracking_contract");
       for (String k : trackingHashesAsBase64.keySet()) {
           byte[] packed = trackingHashesAsBase64.getBinary(k);
           if (packed != null) {
               Contract c = Contract.fromPackedTransaction(packed);
               assertEquals(simpleContract.getId(), c.getId());
           }
       }*/
});


/*unit.test("slot_test: goodSlotContractFromDSL", async () => {
    let nodeInfoProvider = createNodeInfoProvider();

    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    //Contract simpleContract = new Contract(key);
    //simpleContract.seal();

    let simpleContract = Contract.fromPrivateKey(key);
    await simpleContract.seal(true);
    assert(await simpleContract.check());

    //Contract paymentDecreased = createSlotPayment();

    Contract smartContract = SlotContract.fromDslFile(rootPath + "SlotDSLTemplate.yml");
    smartContract.addSignerKeyFromFile(rootPath + "_xer0yfe2nn1xthc.private.unikey");

    assertTrue(smartContract instanceof SlotContract);

    /*
    ((SlotContract)smartContract).putTrackingContract(simpleContract);
    ((SlotContract)smartContract).setNodeInfoProvider(nodeInfoProvider);
    smartContract.addNewItems(paymentDecreased);
    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), smartContract.getDefinition().getExtendedType());
    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), smartContract.get("definition.extended_type"));

    assertEquals(2, ((SlotContract) smartContract).getKeepRevisions());

    Multimap<String, Permission> permissions = smartContract.getPermissions();
    Collection<Permission> mdp = permissions.get("modify_data");
    assertNotNull(mdp);
    assertTrue(((ModifyDataPermission)mdp.iterator().next()).getFields().containsKey("action"));

    assertEquals(simpleContract.getId(), ((SlotContract) smartContract).getTrackingContract().getId());
    assertEquals(simpleContract.getId(), TransactionPack.unpack(((SlotContract) smartContract).getPackedTrackingContract()).getContract().getId());

    Binder trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }
});

unit.test("slot_test: serializeSlotContract", async () => {
    final PrivateKey key = new PrivateKey(Do.read(rootPath + "_xer0yfe2nn1xthc.private.unikey"));
    Contract simpleContract = new Contract(key);
    simpleContract.seal();

    Contract paymentDecreased = createSlotPayment();

    Contract smartContract = new SlotContract(key);

    assertTrue(smartContract instanceof SlotContract);

    ((SlotContract)smartContract).putTrackingContract(simpleContract);
    ((SlotContract)smartContract).setNodeInfoProvider(nodeInfoProvider);
    smartContract.addNewItems(paymentDecreased);
    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    Binder b = BossBiMapper.serialize(smartContract);
    Contract desContract = DefaultBiMapper.deserialize(b);
    assertSameContracts(smartContract, desContract);
    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), desContract.getDefinition().getExtendedType());
    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), desContract.get("definition.extended_type"));
    assertTrue(desContract instanceof SlotContract);

    Multimap<String, Permission> permissions = desContract.getPermissions();
    Collection<Permission> mdp = permissions.get("modify_data");
    assertNotNull(mdp);
    assertTrue(((ModifyDataPermission)mdp.iterator().next()).getFields().containsKey("action"));

    assertEquals(simpleContract.getId(), ((SlotContract) desContract).getTrackingContract().getId());
    assertEquals(simpleContract.getId(), TransactionPack.unpack(((SlotContract) desContract).getPackedTrackingContract()).getContract().getId());

    Binder trackingHashesAsBase64 = desContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }

    Contract copiedContract = smartContract.copy();
    assertSameContracts(smartContract, copiedContract);
    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), copiedContract.getDefinition().getExtendedType());
    assertEquals(NSmartContract.SmartContractType.SLOT1.name(), copiedContract.get("definition.extended_type"));
    assertTrue(copiedContract instanceof SlotContract);

    permissions = copiedContract.getPermissions();
    mdp = permissions.get("modify_data");
    assertNotNull(mdp);
    assertTrue(((ModifyDataPermission)mdp.iterator().next()).getFields().containsKey("action"));

    assertEquals(simpleContract.getId(), ((SlotContract) copiedContract).getTrackingContract().getId());
    assertEquals(simpleContract.getId(), TransactionPack.unpack(((SlotContract) copiedContract).getPackedTrackingContract()).getContract().getId());

    trackingHashesAsBase64 = copiedContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }
});

unit.test("slot_test: goodSlotContract", async () => {

    final PrivateKey key = new PrivateKey(Do.read(rootPath + "_xer0yfe2nn1xthc.private.unikey"));

    Contract simpleContract = new Contract(key);
    simpleContract.seal();

    Contract paymentDecreased = createSlotPayment();

    Contract smartContract = new SlotContract(key);

    assertTrue(smartContract instanceof SlotContract);

    ((SlotContract)smartContract).putTrackingContract(simpleContract);
    ((SlotContract)smartContract).setNodeInfoProvider(nodeInfoProvider);
    ((SlotContract)smartContract).setKeepRevisions(2);
    smartContract.addNewItems(paymentDecreased);
    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    assertEquals(1, ((SlotContract)smartContract).getTrackingContracts().size());
    assertEquals(simpleContract.getId(), ((SlotContract) smartContract).getTrackingContract().getId());
    assertEquals(simpleContract.getId(), TransactionPack.unpack(((SlotContract) smartContract).getPackedTrackingContract()).getContract().getId());

    Binder trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertEquals(simpleContract.getId(), c.getId());
        }
    }

    Contract simpleContract2 = simpleContract.createRevision(key);
    simpleContract2.seal();
    ((SlotContract)smartContract).putTrackingContract(simpleContract2);
    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    assertEquals(2, ((SlotContract)smartContract).getTrackingContracts().size());
    assertEquals(simpleContract2.getId(), ((SlotContract) smartContract).getTrackingContract().getId());
    assertEquals(simpleContract2.getId(), TransactionPack.unpack(((SlotContract) smartContract).getPackedTrackingContract()).getContract().getId());

    trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
    for (String k : trackingHashesAsBase64.keySet()) {
        byte[] packed = trackingHashesAsBase64.getBinary(k);
        if (packed != null) {
            Contract c = Contract.fromPackedTransaction(packed);
            assertThat(c.getId(), Matchers.anyOf(equalTo(simpleContract.getId()), equalTo(simpleContract2.getId())));
        }
    }

    Contract simpleContract3 = simpleContract2.createRevision(key);
    simpleContract3.seal();
    ((SlotContract)smartContract).putTrackingContract(simpleContract3);
    smartContract.seal();
    smartContract.check();
    smartContract.traceErrors();
    assertTrue(smartContract.isOk());

    assertEquals(2, ((SlotContract)smartContract).getTrackingContracts().size());
    assertEquals(simpleContract3.getId(), ((SlotContract) smartContract).getTrackingContract().getId());
    assertEquals(simpleContract3.getId(), TransactionPack.unpack(((SlotContract) smartContract).getPackedTrackingContract()).getContract().getId());

    trackingHashesAsBase64 = smartContract.getStateData().getBinder("tracking_contract");
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

function createSlotPayment() {

    let stepaU = InnerContractsService.createFreshU(100000000, tk.TestKeys.getKey(1));

    let paymentDecreased = stepaU.createRevision(ownerKey);//TODO
    paymentDecreased.state.data["transaction_units"] = stepaU.state.data[transaction_units] - 100;
    paymentDecreased.seal();

    return paymentDecreased;
}*/

