import {expect, unit, assert} from 'test'

import * as cnt from 'contract'
import * as dbm from 'defaultbimapper'
import * as bbm from 'bossbimapper'
import * as constr from 'constraint'
import * as t from 'tools'
import * as d from 'deltas'

unit.test("constraint copy test", () => {

    let c1 = new constr.Constraint(null);
    c1.name = "c1";
    c1.comment = "c1_comment";
    let conds = {};
    conds[constr.Constraint.conditionsModeType.all_of] = ["this.state.data.n1 == 1", "ref.definition.data.s1 == \"string1\""];
    c1.setConditions(conds);

    let c2 = c1.copy();

    c2.baseContract = null;

    let s1 = bbm.BossBiMapper.getInstance().serialize(c1);
    let s2 = bbm.BossBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(s1,s2));
    assert(d.Delta.between(null,s1,s2) == null);

    let ds1 = dbm.DefaultBiMapper.getInstance().serialize(c1);
    let ds2 = dbm.DefaultBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(ds1,ds2));
    assert(d.Delta.between(null,ds1,ds2) == null);
});

unit.test("constraint test: refLessOrEquals", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val<10"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: refMissingField", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val>-100"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: refMissingFieldConstantForEquals", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val==false",
                                                               "ref.state.data.ival==0",
                                                               "false==ref.state.data.val",
                                                               "0==ref.state.data.ival"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: refMissingFieldHashIdForEquals", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));
    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val!=ref.id", "this.id!=ref.state.data.val"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: refMissingFieldRoleForEquals", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));
    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["refMissingFieldRoleForEquals", "refMissingFieldRoleForEquals"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));
    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: refMissingFieldDateTimeForEquals", async () => {

    let privateKey = await crypto.PrivateKey.generate(2048);
    let contractA = cnt.Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));
    let constr = new constr.Constraint(null);
    constr.type = Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val!=ref.definition.created_at", "this.definition.created_at!=ref.state.data.val"];
    constr.setConditions(conditions);

    contractB.addConstraint(constr);

    let batch = cnt.Contract.fromPrivateKey(await crypto.PrivateKey.generate(2048));
    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    batch.seal();
    let res = batch.check();

});

unit.test("constraint test: checkReferences", async () => {

   /* Contract contract1 = Contract.fromDslFile(ROOT_PATH + "references/ReferencedConditions_contract1.yml");
    Contract contract2 = Contract.fromDslFile(ROOT_PATH + "references/ReferencedConditions_contract2.yml");

    PrivateKey key = new PrivateKey(Do.read("./src/test_contracts/" + "_xer0yfe2nn1xthc.private.unikey"));

    Binder conditions = contract1.getReferences().get("ref_string").getConditions();
    List<Object> condList = conditions.getList(all_of.name(), null);

    // Mirroring conditions with strings
    condList.add("\"string\"!=ref.state.data.string3");
    condList.add("\"==INFORMATION==\"==ref.definition.data.string2");
    condList.add("\"26RzRJDLqze3P5Z1AzpnucF75RLi1oa6jqBaDh8MJ3XmTaUoF8R\"==ref.definition.issuer");
    condList.add("\"mqIooBcuyMBRLHZGJGQ7osf6TnoWkkVVBGNG0LDuPiZeXahnDxM+PoPMgEuqzOvsfoWNISyqYaCYyR9" +
        "zCfpZCF6pjZ+HvjsD73pZ6uaXlUY0e72nBPNbAtFhk2pEXyxt\"!= this.id");
    condList.add("\"HggcAQABxAACzHE9ibWlnK4RzpgFIB4jIg3WcXZSKXNAqOTYUtGXY03xJSwpqE+y/HbqqE0WsmcAt5\n" +
        "           a0F5H7bz87Uy8Me1UdIDcOJgP8HMF2M0I/kkT6d59ZhYH/TlpDcpLvnJWElZAfOytaICE01bkOkf6M\n" +
        "           z5egpToDEEPZH/RXigj9wkSXkk43WZSxVY5f2zaVmibUZ9VLoJlmjNTZ+utJUZi66iu9e0SXupOr/+\n" +
        "           BJL1Gm595w32Fd0141kBvAHYDHz2K3x4m1oFAcElJ83ahSl1u85/naIaf2yuxiQNz3uFMTn0IpULCM\n" +
        "           vLMvmE+L9io7+KWXld2usujMXI1ycDRw85h6IJlPcKHVQKnJ/4wNBUveBDLFLlOcMpCzWlO/D7M2Iy\n" +
        "           Na8XEvwPaFJlN1UN/9eVpaRUBEfDq6zi+RC8MaVWzFbNi913suY0Q8F7ejKR6aQvQPuNN6bK6iRYZc\n" +
        "           hxe/FwWIXOr0C0yA3NFgxKLiKZjkd5eJ84GLy+iD00Rzjom+GG4FDQKr2HxYZDdDuLE4PEpYSzEB/8\n" +
        "           LyIqeM7dSyaHFTBII/sLuFru6ffoKxBNk/cwAGZqOwD3fkJjNq1R3h6QylWXI/cSO9yRnRMmMBJwal\n" +
        "           MexOc3/kPEEdfjH/GcJU0Mw6DgoY8QgfaNwXcFbBUvf3TwZ5Mysf21OLHH13g8gzREm+h8c=\"==ref.definition.issuer");
    condList.add("\"1:25\"==this.state.branchId");
    contract1.getReferences().get("ref_string").setConditions(conditions);

    conditions = contract1.getReferences().get("ref_time").getConditions();
    condList = conditions.getList(all_of.name(), null);

    // Mirroring conditions with time string
    condList.add("\"1977-06-14 16:03:10\"<ref.definition.created_at");
    condList.add("\"2958-04-18 00:58:00\">this.definition.expires_at");
    condList.add("\"1968-04-18 23:58:01\" < now");
    condList.add("\"2086-03-22 11:35:37\"!=now");

    contract1.getReferences().get("ref_time").setConditions(conditions);

    contract2.seal();

    Contract contract3 = contract2.createRevision(key);
    contract3.seal();

    // signature to check can_play operator
    contract2.addSignatureToSeal(key);

    contract1.getStateData().set("contract2_origin", contract2.getOrigin().toBase64String());
    contract1.getStateData().set("contract2_id", contract2.getId().toBase64String());
    contract1.getStateData().set("contract3_parent", contract3.getParent().toBase64String());

    contract1.getState().setBranchNumber(25);
    System.out.println("branchId: " + contract1.getState().getBranchId());
    contract1.seal();

    // signature to check can_play operator
    contract1.addSignatureToSeal(key);

    System.out.println("Contract3_parent: " + contract3.getParent().toBase64String());
    System.out.println("contract2_origin:  " + contract1.getStateData().get("contract2_origin"));
    System.out.println("contract2_id:  " + contract1.getStateData().get("contract2_id"));

    TransactionPack tp = new TransactionPack();
    tp.setContract(contract1);
    tp.addSubItem(contract2);
    tp.addReferencedItem(contract2);
    tp.addSubItem(contract3);
    tp.addReferencedItem(contract3);

    Contract refContract = new Contract(contract1.seal(), tp);
    refContract.check();

    System.out.println("Check roles conditions");
    assertTrue(refContract.getReferences().get("ref_roles").matchingItems.contains(contract2));
    System.out.println("Check integer conditions");
    assertTrue(refContract.getReferences().get("ref_integer").matchingItems.contains(contract2));
    System.out.println("Check float conditions");
    assertTrue(refContract.getReferences().get("ref_float").matchingItems.contains(contract2));
    System.out.println("Check string conditions");
    assertTrue(refContract.getReferences().get("ref_string").matchingItems.contains(contract2));
    System.out.println("Check boolean conditions");
    assertTrue(refContract.getReferences().get("ref_boolean").matchingItems.contains(contract2));
    System.out.println("Check inherited conditions");
    assertTrue(refContract.getReferences().get("ref_inherited").matchingItems.contains(contract2));
    System.out.println("Check time conditions");
    assertTrue(refContract.getReferences().get("ref_time").matchingItems.contains(contract2));
    System.out.println("Check ref_hashes conditions");
    assertTrue(refContract.getReferences().get("ref_hashes").matchingItems.contains(contract2));
    System.out.println("Check ref_bigdecimal conditions");
    assertTrue(refContract.getReferences().get("ref_bigdecimal").matchingItems.contains(contract2));
    System.out.println("Check parent conditions");
    assertTrue(refContract.getReferences().get("ref_parent").matchingItems.contains(contract3));
    System.out.println("Check can_play conditions");
    assertTrue(refContract.getReferences().get("ref_can_play").matchingItems.contains(contract2));
    */
});

unit.test("constraint test: checkReferencesContracts", async () => {

    /* Contract contract1 = Contract.fromDslFile(ROOT_PATH + "Referenced_contract1.yml");
    Contract contract2 = Contract.fromDslFile(ROOT_PATH + "Referenced_contract2.yml");
    Contract contract3 = Contract.fromDslFile(ROOT_PATH + "Referenced_contract3.yml");
    contract1.seal();
    contract2.seal();
    contract3.seal();

    TransactionPack tp = new TransactionPack();
    tp.setContract(contract1);
    tp.addSubItem(contract1);
    tp.addReferencedItem(contract1);
    tp.addSubItem(contract2);
    tp.addReferencedItem(contract2);
    tp.addSubItem(contract3);
    tp.addReferencedItem(contract3);

    Contract refContract1 = new Contract(contract1.seal(), tp);
    Contract refContract2 = new Contract(contract3.seal(), tp);

    refContract1.check();
    refContract2.check();

    assertTrue(refContract1.getReferences().get("ref_cont").matchingItems.contains(refContract1));
    assertTrue(refContract1.getReferences().get("ref_cont").matchingItems.contains(contract2));
    assertFalse(refContract1.getReferences().get("ref_cont").matchingItems.contains(contract3));

    assertFalse(refContract1.getReferences().get("ref_cont2").matchingItems.contains(refContract1));
    assertFalse(refContract1.getReferences().get("ref_cont2").matchingItems.contains(contract2));
    assertTrue(refContract1.getReferences().get("ref_cont2").matchingItems.contains(contract3));

    assertTrue(refContract1.getReferences().get("ref_cont_inherit").matchingItems.contains(refContract1));
    assertFalse(refContract1.getReferences().get("ref_cont_inherit").matchingItems.contains(contract2));
    assertFalse(refContract1.getReferences().get("ref_cont_inherit").matchingItems.contains(contract3));

    assertTrue(refContract2.getReferences().get("ref_cont3").matchingItems.contains(contract1));
    assertTrue(refContract2.getReferences().get("ref_cont3").matchingItems.contains(contract2));
    assertTrue(refContract2.getReferences().get("ref_cont3").matchingItems.contains(refContract2));

    assertTrue(refContract2.getReferences().get("ref_cont4").matchingItems.contains(contract1));
    assertFalse(refContract2.getReferences().get("ref_cont4").matchingItems.contains(contract2));
    assertTrue(refContract2.getReferences().get("ref_cont4").matchingItems.contains(refContract2));
    */
});
