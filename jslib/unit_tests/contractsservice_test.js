import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const roles = require('roles');
const cs = require("contractsservice");
const e = require("errors");
const Errors = e.Errors;
const tt = require("test_tools");
const Constraint = require('constraint').Constraint;
const TransactionPack = require("transactionpack").TransactionPack;
const BigDecimal  = require("big").Big;

const root_path = "../test/contractsservice/";

async function checkCreateParcel(contract_file_payload, contract_file_payment) {
    let privateKey = tk.TestKeys.getKey();

    let payment = await Contract.fromDslFile(root_path + contract_file_payment);
    payment.keysToSignWith.add(privateKey);
    await payment.seal(true);

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let parcel = await cs.createParcel(payload, payment, 20, [privateKey]);

    tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.branchId === payment.state.branchId);
    assert(parcel.getPaymentContract().definition.data.equals(payment.definition.data));
}

async function checkCreateParcelFotTestNet(contract_file_payload) {
    let privateKey = tk.TestKeys.getKey();

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let payment = await tt.createFreshU(100, [privateKey.publicKey], true);

    let parcel = await cs.createParcel(payload, payment, 20, [privateKey], true);

    tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.data.transaction_units === 100);
    assert(parcel.getPaymentContract().state.data.test_transaction_units === 10000 - 20);
}


unit.test("contractsservice_test: badRevoke", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");
    c.keysToSignWith.add(key);
    await c.seal(true);
    assert(await c.check());

    let tc = await cs.createRevocation(c, tk.TestKeys.getKey());

    // c can't be revoked with this key!
    assert(!await tc.check());
    assert(1 === tc.errors.length);
    assert(Errors.FORBIDDEN === tc.errors[0].error);
});

unit.test("contractsservice_test: goodRevoke", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");

    c.keysToSignWith.add(key);
    c.registerRole(new roles.SimpleRole("owner", key));

    await c.seal(true);

    let revokeContract = await cs.createRevocation(c, key);

    assert(await revokeContract.check());
});

unit.test("contractsservice_test: checkCreateGoodParcel", async () => {
    await checkCreateParcel("simple_root_contract.yml", "simple_root_contract.yml");
});

unit.test("contractsservice_test: checkCreateParcelBadPayload", async () => {
    await checkCreateParcel("bad_contract_payload.yml", "simple_root_contract.yml");
});

unit.test("contractsservice_test: checkCreateParcelBadPayment", async () => {
    await checkCreateParcel("simple_root_contract.yml","bad_contract_payment.yml");
});

unit.test("contractsservice_test: checkCreateGoodParcelForTestNet", async () => {
    await checkCreateParcelFotTestNet("simple_root_contract.yml");
});

unit.test("contractsservice_test: createU", async () => {
    let privateKey = tk.TestKeys.getKey();

    let u = await tt.createFreshU(100, [privateKey.publicKey]);

    u.transactionPack = new TransactionPack(u);

    assert(await u.check());

    assert(u.roles.owner.isAllowedForKeys([privateKey.publicKey]));
    assert(100 === u.state.data.transaction_units);

    let privateKey2 = tk.TestKeys.getKey();

    assert(!u.roles.owner.isAllowedForKeys([privateKey2.publicKey]));
});

unit.test("contractsservice_test: createTestU", async () => {
    let privateKey = tk.TestKeys.getKey();

    let u = await tt.createFreshU(100, [privateKey.publicKey], true);

    u.transactionPack = new TransactionPack(u);

    assert(await u.check());

    assert(u.roles.owner.isAllowedForKeys([privateKey.publicKey]));
    assert(100 === u.state.data.transaction_units);
    assert(10000 === u.state.data.test_transaction_units);

    let privateKey2 = tk.TestKeys.getKey();

    assert(!u.roles.owner.isAllowedForKeys([privateKey2.publicKey]));
});

unit.test("contractsservice_test: goodNotary", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let notaryContract = await cs.createNotaryContract([key1], [key2.publicKey]);

    assert(await notaryContract.check());

    assert(notaryContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(notaryContract.roles.issuer.isAllowedForKeys([key1]));
    assert(notaryContract.roles.creator.isAllowedForKeys([key1]));

    assert(!notaryContract.roles.owner.isAllowedForKeys([key1]));
    assert(!notaryContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!notaryContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    let date = new Date();
    date.setMonth(date.getMonth() + 3);
    assert(notaryContract.getExpiresAt().getTime() > date.getTime());
    assert(notaryContract.definition.createdAt.getTime() < Date.now());

    assert(notaryContract.isPermitted("revoke", [key2.publicKey]));
    assert(notaryContract.isPermitted("revoke", [key1.publicKey]));

    assert(notaryContract.isPermitted("change_owner", [key2.publicKey]));
    assert(!notaryContract.isPermitted("change_owner", [key1.publicKey]));
});

unit.test("contractsservice_test: goodAttachDataToNotary", async () => {
    let fileName = ["../test/constraints/ReferencedConditions_contract1.yml",
        "../test/constraints/ReferencedConditions_contract2.yml" ];

    let fileDesc = ["ReferencedConditions_contract1.yml - description",
        "ReferencedConditions_contract2.yml - description"];

    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let notaryContract = await cs.createNotaryContract([key1], [key2.publicKey], fileName, fileDesc);

    assert(await notaryContract.check());

    assert(notaryContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(notaryContract.roles.issuer.isAllowedForKeys([key1]));
    assert(notaryContract.roles.creator.isAllowedForKeys([key1]));

    assert(!notaryContract.roles.owner.isAllowedForKeys([key1]));
    assert(!notaryContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!notaryContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    let date = new Date();
    date.setMonth(date.getMonth() + 3);
    assert(notaryContract.getExpiresAt().getTime() > date.getTime());
    assert(notaryContract.definition.createdAt.getTime() < Date.now());

    assert(notaryContract.isPermitted("revoke", [key2.publicKey]));
    assert(notaryContract.isPermitted("revoke", [key1.publicKey]));

    assert(notaryContract.isPermitted("change_owner", [key2.publicKey]));
    assert(!notaryContract.isPermitted("change_owner", [key1.publicKey]));

    let files = notaryContract.definition.data.files;
    assert(files["ReferencedConditions_contract1_yml"]["file_name"] === "ReferencedConditions_contract1.yml");
    assert(files["ReferencedConditions_contract1_yml"]["file_description"] === "ReferencedConditions_contract1.yml - description");
    assert(files["ReferencedConditions_contract2_yml"]["file_name"] === "ReferencedConditions_contract2.yml");
    assert(files["ReferencedConditions_contract2_yml"]["file_description"] === "ReferencedConditions_contract2.yml - description");

    let notaryDeserialized = DefaultBiMapper.getInstance().deserialize(BossBiMapper.getInstance().serialize(notaryContract));
    assert(notaryContract.definition.data.equals(notaryDeserialized.definition.data));

    // checking by ContractsService.checkAttachNotaryContract
    assert(await cs.checkAttachNotaryContract(notaryContract, "../test/constraints/ReferencedConditions_contract1.yml"));
    assert(await cs.checkAttachNotaryContract(notaryContract, "../test/constraints/ReferencedConditions_contract2.yml"));
    assert(await cs.checkAttachNotaryContract(notaryContract, "../test/constraints"));
    assert(await cs.checkAttachNotaryContract(notaryContract, "../test/constraints/"));
    assert(!await cs.checkAttachNotaryContract(notaryContract, "../test/constraints/ReferencedConditions_contract1_v4.yml"));
    assert(!await cs.checkAttachNotaryContract(notaryContract, "../test/contractsservice/bad_contract_payload.yml"));
    assert(!await cs.checkAttachNotaryContract(notaryContract, "../test/contractsservice/"));
    assert(!await cs.checkAttachNotaryContract(notaryContract, "../test/contractsservice"));
});

unit.test("contractsservice_test: goodToken", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("100"));

    assert(await tokenContract.check());

    assert(tokenContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(tokenContract.roles.issuer.isAllowedForKeys([key1]));
    assert(tokenContract.roles.creator.isAllowedForKeys([key1]));

    assert(!tokenContract.roles.owner.isAllowedForKeys([key1]));
    assert(!tokenContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!tokenContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    let date = new Date();
    date.setMonth(date.getMonth() + 3);
    assert(tokenContract.getExpiresAt().getTime() > date.getTime());
    assert(tokenContract.definition.createdAt.getTime() < Date.now());

    assert(tokenContract.state.data["amount"] === "100");
    assert(tokenContract.definition.permissions.get("split_join").length === 1);

    let splitJoinParams = tokenContract.definition.permissions.get("split_join")[0].params;
    assert(splitJoinParams.min_value === "0.01");
    assert(splitJoinParams.min_unit === "0.01");
    assert(splitJoinParams.field_name === "amount");
    assert(splitJoinParams.join_match_fields instanceof Array);
    assert(splitJoinParams.join_match_fields.length === 1);
    assert(splitJoinParams.join_match_fields[0] === "state.origin");

    assert(tokenContract.isPermitted("revoke", [key2.publicKey]));
    assert(tokenContract.isPermitted("revoke", [key1.publicKey]));

    assert(tokenContract.isPermitted("change_owner", [key2.publicKey]));
    assert(!tokenContract.isPermitted("change_owner", [key1.publicKey]));

    assert(tokenContract.isPermitted("split_join", [key2.publicKey]));
    assert(!tokenContract.isPermitted("split_join", [key1.publicKey]));
});

unit.test("contractsservice_test: goodShare", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let shareContract = await cs.createShareContract([key1], [key2.publicKey], new BigDecimal("100"));

    assert(await shareContract.check());

    assert(shareContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(shareContract.roles.issuer.isAllowedForKeys([key1]));
    assert(shareContract.roles.creator.isAllowedForKeys([key1]));

    assert(!shareContract.roles.owner.isAllowedForKeys([key1]));
    assert(!shareContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!shareContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    let date = new Date();
    date.setMonth(date.getMonth() + 3);
    assert(shareContract.getExpiresAt().getTime() > date.getTime());
    assert(shareContract.definition.createdAt.getTime() < Date.now());

    assert(shareContract.state.data["amount"] === "100");
    assert(shareContract.definition.permissions.get("split_join").length === 1);

    let splitJoinParams = shareContract.definition.permissions.get("split_join")[0].params;
    assert(splitJoinParams.min_value === 1);
    assert(splitJoinParams.min_unit === 1);
    assert(splitJoinParams.field_name === "amount");
    assert(splitJoinParams.join_match_fields instanceof Array);
    assert(splitJoinParams.join_match_fields.length === 1);
    assert(splitJoinParams.join_match_fields[0] === "state.origin");

    assert(shareContract.isPermitted("revoke", [key2.publicKey]));
    assert(shareContract.isPermitted("revoke", [key1.publicKey]));

    assert(shareContract.isPermitted("change_owner", [key2.publicKey]));
    assert(!shareContract.isPermitted("change_owner", [key1.publicKey]));

    assert(shareContract.isPermitted("split_join", [key2.publicKey]));
    assert(!shareContract.isPermitted("split_join", [key1.publicKey]));
});

unit.test("contractsservice_test: badSplit", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key1]);

    // not permitted split by owner (key2)
    assert(!await splitContract.check());

    splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2]);

    // not signed by creator (key1)
    assert(!await splitContract.check());
});

unit.test("contractsservice_test: goodSplit", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2], true);

    assert(await splitContract.check());
    assert(await tokenContract.check());

    assert(splitContract.state.data.amount === "744");
    assert(Array.from(splitContract.newItems)[0].state.data.amount === "256");
    assert(Array.from(splitContract.revokingItems)[0].state.data.amount === "1000");
});