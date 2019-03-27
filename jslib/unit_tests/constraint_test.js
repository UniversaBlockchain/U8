import {expect, unit, assert} from 'test'

import * as cnt from 'contract'
import * as tp from 'transactionpack'
import * as dbm from 'defaultbimapper'
import * as bbm from 'bossbimapper'
import * as constr from 'constraint'
import * as t from 'tools'
import * as d from 'deltas'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const ROOT_PATH = "../test/constraints/";

unit.test("constraint copy test", () => {

    let c1 = new constr.Constraint(Contract.fromPrivateKey(tk.TestKeys.getKey()));
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

unit.test("constraint test: simple check", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractBase = Contract.fromPrivateKey(privateKey);

    contractBase.state.data["str_val"] = "~~~ simple string! ===";
    contractBase.state.data["num_val"] = -103.5678;
    contractBase.state.data["big_val"] = "4503290488913829183281920913092019320193097.7718423894839282493892109107";

    let contractRef = Contract.fromPrivateKey(privateKey);

    contractRef.state.data["ref_str_val"] = "12345 another_string +++";
    contractRef.state.data["ref_num_val"] = 32903103.5678;
    contractRef.state.data["ref_big_val"] = "4503290488913829183281920913092019320193097.7718423894839282493892109106";

    let cr = new constr.Constraint(contractRef);
    cr.type = constr.Constraint.TYPE_EXISTING_DEFINITION;
    cr.name = "constraintRef";
    let conditionsRef = {};
    conditionsRef[constr.Constraint.conditionsModeType.all_of] = ["ref.issuer == this.issuer"];
    cr.setConditions(conditionsRef);
    contractRef.addConstraint(cr);

    await contractRef.seal();
    contractBase.state.data["id_val"] = contractRef.id.base64;

    let c = new constr.Constraint(contractBase);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    c.name = "base_constraint";
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = [
        "this.state.data.str_val == \"~~~ simple string! ===\"",
        "ref.state.data.ref_str_val == \"12345 another_string +++\"",
        "this.state.data.num_val >= -103.6903",
        "ref.state.data.ref_num_val < 32903103.8093",
        "ref.state.data.ref_big_val <= this.state.data.big_val",
        "ref.state.data.ref_big_val::number < this.state.data.big_val::number",
        "ref.state.data.ref_big_val::number == 4503290488913829183281920913092019320193097.7718423894839282493892109106",
        "this.state.data.big_val::number > 4503290488913829183281920913092019320193097.77184238948392824938921091069999",
        "this.creator == this.owner",
        "ref.owner == this.creator",
        "ref.owner == this.owner",
        "ref.issuer != \"26RzRJDLqze3P5Z1AzpnucF75RLi1oa6jqBaDh8MJ3XmTaUoF8R\"",
        "this.owner == \"" + privateKey.longAddress + "\"",
        "ref.issuer == \"" + privateKey.longAddress + "\"",
        "ref.owner == \"" + btoa(privateKey.publicKey.packed) + "\"",
        "this.issuer == \"" + btoa(privateKey.publicKey.packed) + "\"",
        "this.state.data.id_val == ref.id",
        "ref.id == \"" + contractRef.id.base64 + "\"",
        "now >= ref.definition.created_at",
        "\"2014-03-11 15:04:07\" < now",
        "1000000000 <= this.definition.created_at",
        "ref.state.expires_at > \"1992-03-11 00:04:07\"",
        "this.state.data.num_val defined",
        "this.state.data.big_val defined",
        "ref.state.data.ref_str_val defined",
        "this.xxx.data.qwerty undefined",
        "ref.definition.asd undefined",
        "ref.definition.data.undef_val undefined",
        "inherits ref.definition.constraints.constraintRef",
        "this.state.constraints.base_constraint is_a ref.definition.constraints.constraintRef",
        "this can_play this.issuer",
        "this can_play this.owner",
        "this can_play this.creator",
        "ref can_play ref.issuer",
        "ref can_play ref.owner",
        "ref can_play ref.creator"
    ];
    c.setConditions(conditions);

    contractBase.addConstraint(c);

    await contractBase.seal();
    contractBase.transactionPack = new tp.TransactionPack(contractBase);

    let res = await contractBase.check();
    assert(!res);

    //clear errors
    contractBase.errors = [];

    //add referenced contract
    contractBase.newItems.add(contractRef);
    await contractBase.seal();
    contractBase.transactionPack = new tp.TransactionPack(contractBase);

    res = await contractBase.check();
    assert(res);
});

unit.test("constraint test: refLessOrEquals", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());

    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val<=10"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: refMissingField", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());

    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val>-100"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: refMissingFieldConstantForEquals", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());

    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val==false",
                                                               "ref.state.data.ival==0",
                                                               "false==ref.state.data.val",
                                                               "0==ref.state.data.ival"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: refMissingFieldHashIdForEquals", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());
    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val!=ref.id", "this.id!=ref.state.data.val"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());

    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: refMissingFieldRoleForEquals", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());
    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val!=ref.issuer", "this.issuer!=ref.state.data.val"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());
    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: refMissingFieldDateTimeForEquals", async () => {

    let privateKey = tk.TestKeys.getKey();
    let contractA = Contract.fromPrivateKey(privateKey);

    contractA.state.data["another_val"] = 100;

    let contractB = Contract.fromPrivateKey(tk.TestKeys.getKey());
    let c = new constr.Constraint(contractB);
    c.type = constr.Constraint.TYPE_EXISTING_STATE;
    let conditions = {};
    conditions[constr.Constraint.conditionsModeType.all_of] = ["ref.state.data.val!=ref.definition.created_at", "this.definition.created_at!=ref.state.data.val"];
    c.setConditions(conditions);

    contractB.addConstraint(c);

    let batch = Contract.fromPrivateKey(tk.TestKeys.getKey());
    batch.newItems.add(contractA);
    batch.newItems.add(contractB);
    await batch.seal();
    batch.transactionPack = new tp.TransactionPack(batch);

    let res = await batch.check();
    assert(!res);
});

unit.test("constraint test: checkConstraints", async () => {

    let contract1 = await Contract.fromDslFile(ROOT_PATH + "ReferencedConditions_contract1.yml");
    let contract2 = await Contract.fromDslFile(ROOT_PATH + "ReferencedConditions_contract2.yml");

    let privateBytes = await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes();
    let key = new crypto.PrivateKey(privateBytes);

    let conditions = contract1.constraints.get("ref_roles").conditions;
    let condList = conditions["all_of"];

    // Mirroring conditions with strings
    condList.push("\"string\"!=ref.state.data.string3");
    condList.push("\"==INFORMATION==\"==ref.definition.data.string2");
    condList.push("\"26RzRJDLqze3P5Z1AzpnucF75RLi1oa6jqBaDh8MJ3XmTaUoF8R\"==ref.definition.issuer");
    condList.push("\"mqIooBcuyMBRLHZGJGQ7osf6TnoWkkVVBGNG0LDuPiZeXahnDxM+PoPMgEuqzOvsfoWNISyqYaCYyR9" +
        "zCfpZCF6pjZ+HvjsD73pZ6uaXlUY0e72nBPNbAtFhk2pEXyxt\"!= this.id");
    condList.push("\"HggcAQABxAACzHE9ibWlnK4RzpgFIB4jIg3WcXZSKXNAqOTYUtGXY03xJSwpqE+y/HbqqE0WsmcAt5\n" +
        "           a0F5H7bz87Uy8Me1UdIDcOJgP8HMF2M0I/kkT6d59ZhYH/TlpDcpLvnJWElZAfOytaICE01bkOkf6M\n" +
        "           z5egpToDEEPZH/RXigj9wkSXkk43WZSxVY5f2zaVmibUZ9VLoJlmjNTZ+utJUZi66iu9e0SXupOr/+\n" +
        "           BJL1Gm595w32Fd0141kBvAHYDHz2K3x4m1oFAcElJ83ahSl1u85/naIaf2yuxiQNz3uFMTn0IpULCM\n" +
        "           vLMvmE+L9io7+KWXld2usujMXI1ycDRw85h6IJlPcKHVQKnJ/4wNBUveBDLFLlOcMpCzWlO/D7M2Iy\n" +
        "           Na8XEvwPaFJlN1UN/9eVpaRUBEfDq6zi+RC8MaVWzFbNi913suY0Q8F7ejKR6aQvQPuNN6bK6iRYZc\n" +
        "           hxe/FwWIXOr0C0yA3NFgxKLiKZjkd5eJ84GLy+iD00Rzjom+GG4FDQKr2HxYZDdDuLE4PEpYSzEB/8\n" +
        "           LyIqeM7dSyaHFTBII/sLuFru6ffoKxBNk/cwAGZqOwD3fkJjNq1R3h6QylWXI/cSO9yRnRMmMBJwal\n" +
        "           MexOc3/kPEEdfjH/GcJU0Mw6DgoY8QgfaNwXcFbBUvf3TwZ5Mysf21OLHH13g8gzREm+h8c=\"==ref.definition.issuer");
    condList.push("\"1:25\"==this.state.branchId");
    contract1.constraints.get("ref_roles").setConditions(conditions);

    conditions = contract1.constraints.get("ref_time").conditions;
    condList = conditions["all_of"];

    // Mirroring conditions with time string
    condList.push("\"1977-06-14 16:03:10\"<ref.definition.created_at");
    condList.push("\"2958-04-18 00:58:00\">this.definition.expires_at");
    condList.push("\"1968-04-18 23:58:01\" < now");
    condList.push("\"2086-03-22 11:35:37\"!=now");

    contract1.constraints.get("ref_time").setConditions(conditions);

    await contract2.seal();

    let contract3 = contract2.createRevision([key]);
    await contract3.seal();

    // signature to check can_play operator
    await contract2.addSignatureToSeal(key);

    contract1.state.data["contract2_origin"] = contract2.getOrigin().base64;
    contract1.state.data["contract2_id"] = contract2.id.base64;
    contract1.state.data["contract3_parent"] = contract3.state.parent.base64;

    contract1.state.setBranchNumber(25);

    await contract1.seal();

    // signature to check can_play operator
    await contract1.addSignatureToSeal(key);

    let tpack = new tp.TransactionPack(contract1);
    tpack.subItems.set(contract2.id, contract2);
    tpack.referencedItems.set(contract2.id, contract2);
    tpack.subItems.set(contract3.id, contract3);
    tpack.referencedItems.set(contract3.id, contract3);

    //contract1 = new Contract.fromSealedBinary(contract1.sealedBinary, tpack);

    await contract1.check();

    assert(contract1.constraints.get("ref_roles").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_integer").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_float").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_string").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_boolean").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_inherited").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_time").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_hashes").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_bigdecimal").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_parent").matchingItems.has(contract3));
    assert(contract1.constraints.get("ref_can_play").matchingItems.has(contract2));
});

unit.test("constraint test: checkConstraintsAPILevel4", async () => {

    let contract1 = await Contract.fromDslFile(ROOT_PATH + "ReferencedConditions_contract1_v4.yml");
    let contract2 = await Contract.fromDslFile(ROOT_PATH + "ReferencedConditions_contract2.yml");

    let privateBytes = await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes();
    let key = new crypto.PrivateKey(privateBytes);

    let conditions = contract1.constraints.get("ref_roles").conditions;
    let condList = conditions["all_of"];

    // Mirroring conditions with strings
    condList.push("\"string\"!=ref.state.data.string3");
    condList.push("\"==INFORMATION==\"==ref.definition.data.string2");
    condList.push("\"26RzRJDLqze3P5Z1AzpnucF75RLi1oa6jqBaDh8MJ3XmTaUoF8R\"==ref.definition.issuer");
    condList.push("\"mqIooBcuyMBRLHZGJGQ7osf6TnoWkkVVBGNG0LDuPiZeXahnDxM+PoPMgEuqzOvsfoWNISyqYaCYyR9" +
        "zCfpZCF6pjZ+HvjsD73pZ6uaXlUY0e72nBPNbAtFhk2pEXyxt\"!= this.id");
    condList.push("\"HggcAQABxAACzHE9ibWlnK4RzpgFIB4jIg3WcXZSKXNAqOTYUtGXY03xJSwpqE+y/HbqqE0WsmcAt5\n" +
        "           a0F5H7bz87Uy8Me1UdIDcOJgP8HMF2M0I/kkT6d59ZhYH/TlpDcpLvnJWElZAfOytaICE01bkOkf6M\n" +
        "           z5egpToDEEPZH/RXigj9wkSXkk43WZSxVY5f2zaVmibUZ9VLoJlmjNTZ+utJUZi66iu9e0SXupOr/+\n" +
        "           BJL1Gm595w32Fd0141kBvAHYDHz2K3x4m1oFAcElJ83ahSl1u85/naIaf2yuxiQNz3uFMTn0IpULCM\n" +
        "           vLMvmE+L9io7+KWXld2usujMXI1ycDRw85h6IJlPcKHVQKnJ/4wNBUveBDLFLlOcMpCzWlO/D7M2Iy\n" +
        "           Na8XEvwPaFJlN1UN/9eVpaRUBEfDq6zi+RC8MaVWzFbNi913suY0Q8F7ejKR6aQvQPuNN6bK6iRYZc\n" +
        "           hxe/FwWIXOr0C0yA3NFgxKLiKZjkd5eJ84GLy+iD00Rzjom+GG4FDQKr2HxYZDdDuLE4PEpYSzEB/8\n" +
        "           LyIqeM7dSyaHFTBII/sLuFru6ffoKxBNk/cwAGZqOwD3fkJjNq1R3h6QylWXI/cSO9yRnRMmMBJwal\n" +
        "           MexOc3/kPEEdfjH/GcJU0Mw6DgoY8QgfaNwXcFbBUvf3TwZ5Mysf21OLHH13g8gzREm+h8c=\"==ref.definition.issuer");
    condList.push("\"1:25\"==this.state.branchId");
    contract1.constraints.get("ref_roles").setConditions(conditions);

    conditions = contract1.constraints.get("ref_time").conditions;
    condList = conditions["all_of"];

    // Mirroring conditions with time string
    condList.push("\"1977-06-14 16:03:10\"<ref.definition.created_at");
    condList.push("\"2958-04-18 00:58:00\">this.definition.expires_at");
    condList.push("\"1968-04-18 23:58:01\" < now");
    condList.push("\"2086-03-22 11:35:37\"!=now");

    contract1.constraints.get("ref_time").setConditions(conditions);

    await contract2.seal();

    let contract3 = contract2.createRevision([key]);
    await contract3.seal();

    // signature to check can_play operator
    await contract2.addSignatureToSeal(key);

    contract1.state.data["contract2_origin"] = contract2.getOrigin().base64;
    contract1.state.data["contract2_id"] = contract2.id.base64;
    contract1.state.data["contract3_parent"] = contract3.state.parent.base64;

    contract1.state.setBranchNumber(25);

    await contract1.seal();

    // signature to check can_play operator
    await contract1.addSignatureToSeal(key);

    let tpack = new tp.TransactionPack(contract1);
    tpack.subItems.set(contract2.id, contract2);
    tpack.referencedItems.set(contract2.id, contract2);
    tpack.subItems.set(contract3.id, contract3);
    tpack.referencedItems.set(contract3.id, contract3);

    //contract1 = new Contract.fromSealedBinary(contract1.sealedBinary, tpack);

    await contract1.check();

    assert(contract1.constraints.get("ref_roles").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_integer").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_float").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_string").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_boolean").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_inherited").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_time").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_hashes").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_bigdecimal").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_parent").matchingItems.has(contract3));
    assert(contract1.constraints.get("ref_can_play").matchingItems.has(contract2));
    assert(contract1.constraints.get("ref_arithmetic").matchingItems.has(contract2));
});

unit.test("constraint test: checkConstraintsBetweenContracts", async () => {

    let contract1 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract1.yml");
    let contract2 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract2.yml");
    let contract3 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract3.yml");
    await contract1.seal();
    await contract2.seal();
    await contract3.seal();

    let tpack = new tp.TransactionPack(contract1);
    tpack.subItems.set(contract1.id, contract1);
    tpack.referencedItems.set(contract1.id, contract1);
    tpack.subItems.set(contract2.id, contract2);
    tpack.referencedItems.set(contract2.id, contract2);
    tpack.subItems.set(contract3.id, contract3);
    tpack.referencedItems.set(contract3.id, contract3);

    let refContract1 = Contract.fromSealedBinary(contract1.sealedBinary, tpack);
    let refContract2 = Contract.fromSealedBinary(contract3.sealedBinary, tpack);

    await refContract1.check();
    await refContract2.check();

    assert(refContract1.constraints.get("ref_cont").matchingItems.has(refContract1));
    assert(refContract1.constraints.get("ref_cont").matchingItems.has(contract2));
    assert(!refContract1.constraints.get("ref_cont").matchingItems.has(contract3));

    assert(!refContract1.constraints.get("ref_cont2").matchingItems.has(refContract1));
    assert(!refContract1.constraints.get("ref_cont2").matchingItems.has(contract2));
    assert(refContract1.constraints.get("ref_cont2").matchingItems.has(contract3));

    assert(refContract1.constraints.get("ref_cont_inherit").matchingItems.has(refContract1));
    assert(!refContract1.constraints.get("ref_cont_inherit").matchingItems.has(contract2));
    assert(!refContract1.constraints.get("ref_cont_inherit").matchingItems.has(contract3));

    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(contract1));
    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(contract2));
    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(refContract2));

    assert(refContract2.constraints.get("ref_cont4").matchingItems.has(contract1));
    assert(!refContract2.constraints.get("ref_cont4").matchingItems.has(contract2));
    assert(refContract2.constraints.get("ref_cont4").matchingItems.has(refContract2));
});

unit.test("constraint test: checkConstraintsBetweenContractsAPILevel4", async () => {

    let contract1 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract1_v4.yml");
    let contract2 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract2.yml");
    let contract3 = await Contract.fromDslFile(ROOT_PATH + "Referenced_contract3.yml");
    await contract1.seal();
    await contract2.seal();
    await contract3.seal();

    let tpack = new tp.TransactionPack(contract1);
    tpack.subItems.set(contract1.id, contract1);
    tpack.referencedItems.set(contract1.id, contract1);
    tpack.subItems.set(contract2.id, contract2);
    tpack.referencedItems.set(contract2.id, contract2);
    tpack.subItems.set(contract3.id, contract3);
    tpack.referencedItems.set(contract3.id, contract3);

    let refContract1 = Contract.fromSealedBinary(contract1.sealedBinary, tpack);
    let refContract2 = Contract.fromSealedBinary(contract3.sealedBinary, tpack);

    await refContract1.check();
    await refContract2.check();

    assert(refContract1.constraints.get("ref_cont").matchingItems.has(refContract1));
    assert(refContract1.constraints.get("ref_cont").matchingItems.has(contract2));
    assert(!refContract1.constraints.get("ref_cont").matchingItems.has(contract3));

    assert(!refContract1.constraints.get("ref_cont2").matchingItems.has(refContract1));
    assert(!refContract1.constraints.get("ref_cont2").matchingItems.has(contract2));
    assert(refContract1.constraints.get("ref_cont2").matchingItems.has(contract3));

    assert(refContract1.constraints.get("ref_cont_inherit").matchingItems.has(refContract1));
    assert(!refContract1.constraints.get("ref_cont_inherit").matchingItems.has(contract2));
    assert(!refContract1.constraints.get("ref_cont_inherit").matchingItems.has(contract3));

    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(contract1));
    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(contract2));
    assert(refContract2.constraints.get("ref_cont3").matchingItems.has(refContract2));

    assert(refContract2.constraints.get("ref_cont4").matchingItems.has(contract1));
    assert(!refContract2.constraints.get("ref_cont4").matchingItems.has(contract2));
    assert(refContract2.constraints.get("ref_cont4").matchingItems.has(refContract2));
});

unit.test("constraint test: checkConstraintsAssembly", async () => {

    let contract1 = await Contract.fromDslFile(ROOT_PATH + "ReferencedConditions_contract1_v4.yml");

    let ref_roles = contract1.constraints.get("ref_roles").exportConditions();
    assert(~ref_roles["all_of"].indexOf("this.definition.issuer==ref.definition.issuer"));
    assert(~ref_roles["all_of"].indexOf("ref.owner defined"));
    assert(~ref_roles["all_of"].indexOf("ref.owner!=\"26RzRJDLqze3P5Z1AzpnucF75RLi1oa6jqBaDh8MJ3XmTaUoF8R\""));
    assert(~ref_roles["all_of"].indexOf("ref.definition.issuer==\"HggcAQABxAACzHE9ibWlnK4RzpgFIB4jIg3WcXZSKXNAqOTYUtGXY03xJSwpqE+y/HbqqE0WsmcAt5a0F5H7bz87Uy8Me1UdIDcOJgP8HMF2M0I/kkT6d59ZhYH/TlpDcpLvnJWElZAfOytaICE01bkOkf6Mz5egpToDEEPZH/RXigj9wkSXkk43WZSxVY5f2zaVmibUZ9VLoJlmjNTZ+utJUZi66iu9e0SXupOr/+BJL1Gm595w32Fd0141kBvAHYDHz2K3x4m1oFAcElJ83ahSl1u85/naIaf2yuxiQNz3uFMTn0IpULCMvLMvmE+L9io7+KWXld2usujMXI1ycDRw85h6IJlPcKHVQKnJ/4wNBUveBDLFLlOcMpCzWlO/D7M2IyNa8XEvwPaFJlN1UN/9eVpaRUBEfDq6zi+RC8MaVWzFbNi913suY0Q8F7ejKR6aQvQPuNN6bK6iRYZchxe/FwWIXOr0C0yA3NFgxKLiKZjkd5eJ84GLy+iD00Rzjom+GG4FDQKr2HxYZDdDuLE4PEpYSzEB/8LyIqeM7dSyaHFTBII/sLuFru6ffoKxBNk/cwAGZqOwD3fkJjNq1R3h6QylWXI/cSO9yRnRMmMBJwalMexOc3/kPEEdfjH/GcJU0Mw6DgoY8QgfaNwXcFbBUvf3TwZ5Mysf21OLHH13g8gzREm+h8c=\""));

    let ref_integer = contract1.constraints.get("ref_integer").exportConditions();
    let ref_float = contract1.constraints.get("ref_float").exportConditions();
    let ref_string = contract1.constraints.get("ref_string").exportConditions();
    let ref_boolean = contract1.constraints.get("ref_boolean").exportConditions();
    let ref_inherited = contract1.constraints.get("ref_inherited").exportConditions();
    let ref_time = contract1.constraints.get("ref_time").exportConditions();
    let ref_hashes = contract1.constraints.get("ref_hashes").exportConditions();
    let ref_bigdecimal = contract1.constraints.get("ref_bigdecimal").exportConditions();
    let ref_parent = contract1.constraints.get("ref_parent").exportConditions();
    let ref_can_play = contract1.constraints.get("ref_can_play").exportConditions();

    let ref_arithmetic = contract1.constraints.get("ref_arithmetic").exportConditions();
    assert(~ref_arithmetic["all_of"].indexOf("11>2*3+4"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.int3<this.state.data.double4*1000"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.int3*this.state.data.double3<=ref.state.data.int3*ref.state.data.double3"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.amount*ref.state.data.bigdecimal2::number>=ref.state.data.bigdecimal2::number+this.state.data.int4"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.int4+2!=ref.state.data.int4*2+100"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.double3+this.state.data.double4*ref.state.data.bigdecimal2::number==ref.state.data.double3+ref.state.data.double4*ref.state.data.bigdecimal2::number"));
    assert(~ref_arithmetic["all_of"].indexOf("905403309310398882034989390090914246789283284338888398980001111290943204920940290078452983729*73<=ref.state.data.bigdecimal1::number"));
    assert(~ref_arithmetic["all_of"].indexOf("ref.state.data.bigdecimal2::number/98401804310430918418409810948390180==this.state.data.bigdecimal1::number/98401804310430918418409810948390180"));
    assert(~ref_arithmetic["all_of"].indexOf("-554454.02193092103920101293012902*ref.state.data.bigdecimal2::number!=-554454.02193092103920101293012902*this.state.data.bigdecimal2::number"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.bigdecimal1::number*ref.state.data.bigdecimal2::number+this.state.data.int3*ref.state.data.bigdecimal1::number>ref.state.data.bigdecimal2::number*this.state.data.bigdecimal1::number-this.state.data.int3"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.bigdecimal1::number*ref.state.data.bigdecimal2::number+ref.state.data.bigdecimal1::number*ref.state.data.bigdecimal2::number>ref.state.data.bigdecimal2::number*this.state.data.bigdecimal1::number-this.state.data.int3"));
    assert(~ref_arithmetic["all_of"].indexOf("this.state.data.bigdecimal1::number+ref.state.data.bigdecimal2::number*this.state.data.int3!=ref.state.data.bigdecimal2::number+this.state.data.bigdecimal1::number/this.state.data.int3"));
    assert(~ref_arithmetic["all_of"].indexOf("12+4*(10+5)==72"));
    assert(~ref_arithmetic["all_of"].indexOf("12+(4*(10+5))==72"));
    assert(~ref_arithmetic["all_of"].indexOf("(-5)+2<0"));
    assert(~ref_arithmetic["all_of"].indexOf("(-10)-(-20)>=2*(-10)"));
    assert(~ref_arithmetic["all_of"].indexOf("554454.02193092*(ref.state.data.bigdecimal1::number-this.state.data.bigdecimal1::number)+1>this.state.data.bigdecimal1::number"));
    assert(~ref_arithmetic["all_of"].indexOf("(this.state.data.int3-7)/(70+7)*(this.state.data.float3-775)-1==(((ref.state.data.float4-7)/10-7)/10-7)/10+12"));
    assert(~ref_arithmetic["all_of"].indexOf("(-3+4)*2!=(-13+1)/(5-4)"));
    assert(~ref_arithmetic["all_of"].indexOf("((((3+4)*2)/(2*10))+15)*this.state.data.bigdecimal1::number>=(13-1)/(5-4)"));
    assert(~ref_arithmetic["all_of"].indexOf("(((13-7)/(8-6))+27)*3>(this.state.data.amount-100)/ref.state.data.bigdecimal2::number"));
    assert(~ref_arithmetic["all_of"].indexOf("ref.state.data.bigdecimal2::number+this.state.data.bigdecimal1::number==(this.state.data.bigdecimal1::number+ref.state.data.bigdecimal2::number)*((ref.state.data.bigdecimal2::number*3-ref.state.data.bigdecimal2::number*2)/ref.state.data.bigdecimal2::number)"));
    assert(~ref_arithmetic["all_of"].indexOf("(-554454.02193092)+(-554454.02193092)>=((-554454.02193092)+(-554454.02193092))*(((-554454.02193092)*3-(-554454.02193092)*2)/(-554454.02193092))"));
    assert(~ref_arithmetic["all_of"].indexOf("90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939+90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939==(90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939+90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939)*((90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939*3-90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939*2)/90540330931039888203498939009091424678928328433888839898000111129094320492094029007845298372939)"));
    assert(~ref_arithmetic["all_of"].indexOf("(((13-7)/(8-6))+27)*3>(this.state.data.amount-100)/ref.state.data.bigdecimal2::number"));
    assert(~ref_arithmetic["all_of"].indexOf("((this.state.data.double4-this.state.data.int5)*2)+((this.state.data.bigdecimal1::number+this.state.data.int5)*this.state.data.int3)<=((ref.state.data.double4+this.state.data.int5)*2)+((this.state.data.bigdecimal1::number+this.state.data.int5)*ref.state.data.int3)"));
});