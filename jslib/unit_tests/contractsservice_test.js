import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const KeyRecord = require("keyrecord").KeyRecord;
const roles = require('roles');
const cs = require("contractsservice");
const Errors = e.Errors;
const tt = require("test_tools");
const Constraint = require('constraint').Constraint;

async function checkCreateParcel(contract_file_payload, contract_file_payment) {
    let root_path = "../test/contractsservice/";

    let privateKey = tk.TestKeys.getKey();

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let payment = await Contract.fromDslFile(root_path + contract_file_payment);
    payload.keysToSignWith.add(privateKey);
    await payment.seal(true);

    let parcel = await cs.createParcel(payload, payment.transactionPack, 20, [privateKey]);

    tt.assertSameContracts(parcel.getPayloadContract(), payload);
    tt.assertSameContracts(parcel.getPaymentContract(), payment);
}

async function checkCreateParcelFotTestNet(contract_file_payload) {
    let root_path = "../test/contractsservice/";

    let privateKey = tk.TestKeys.getKey();

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let payment = await tt.createFreshU(100, [privateKey.publicKey], true);

    let parcel = cs.createParcel(payload, payment, 20, [privateKey], true);

    tt.assertSameContracts(parcel.getPayloadContract(), payload);
    tt.assertSameContracts(parcel.getPaymentContract(), payment);

    assert(100 === parcel.getPaymentContract().state.data.transaction_units);
    assert(10000 - 20 === parcel.getPaymentContract().state.data.test_transaction_units);
}


unit.test("contractsservice_test: badRevoke", async () => {
    /*let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");
    c.keysToSignWith.add(key);
    await c.seal(true);

    let issuer = tk.TestKeys.getKey();
    let tc = await cs.createRevocation(c, issuer);

    // c can't be revoked with this key!
    assert(!await tc.check());
    assert(1 === tc.errors.length);
    assert(Errors.FORBIDDEN === tc.errors);
});

unit.test("contractsservice_test: goodRevoke", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");

    c.keysToSignWith.add(key);
    c.registerRole(new roles.SimpleRole("owner", key));

    await c.seal(true);

    let revokeContract = c.createRevocation(c, [key]);

    assert(!await revokeContract.check());
});

unit.test("contractsservice_test: checkTransactional", async () => {
    let key = new crypto.PrivateKey(await (await io.openRead("../test/_xer0yfe2nn1xthc.private.unikey")).allBytes());

    let delorean = await Contract.fromDslFile("../test/DeLoreanOwnership.yml");
    delorean.keysToSignWith.add(key);
    await delorean.seal(true);

    //delorean.traceErrors();
    assert(await delorean.check());

    delorean.createTransactionalSection();

    let constraint = new Constraint(delorean);

    delorean.transactional.addConstraint(constraint);
    let delorean2 = delorean.createRevision(delorean.transactional);

    delorean2.keysToSignWith.add(key);
    await delorean2.seal(true);

    //delorean2.traceErrors();
    assert(await delorean2.check());
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

    assert(await u.check());
    //u.traceErrors();

    //assertEquals(true, u.getRole("owner").isAllowedForKeys(keys));
    assert(100 === u.state.data.transaction_units);

    let privateKey2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/u_key.private.unikey")).allBytes());

    //assertEquals(false, u.getRole("owner").isAllowedForKeys(privateKey2.publicKey));
});

unit.test("contractsservice_test: createTestU", async () => {
    let privateKey = tk.TestKeys.getKey();

    let u = await tt.createFreshU(100, [privateKey.publicKey], true);

    assert(await u.check());
    //u.traceErrors();

    //assertEquals(true, u.getRole("owner").isAllowedForKeys(keys));
    assert(100 === u.state.data.transaction_units);
    assert(10000 === u.state.data.test_transaction_units);


    let privateKey2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/u_key.private.unikey")).allBytes());

    //assertEquals(false, u.getRole("owner").isAllowedForKeys(privateKey2.publicKey));
});

unit.test("contractsservice_test: goodNotary", async () => {
    let key1 = new crypto.PrivateKey(await (await io.openRead("../test/keys/marty_mcfly.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/test_payment_owner.private.unikey")).allBytes());

    let notaryContract = await cs.createNotaryContract(key1, [key2.publicKey]);

    assert(await notaryContract.check());

    assert(notaryContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(notaryContract.roles.issuer.isAllowedForKeys([key1]));
    assert(notaryContract.roles.creator.isAllowedForKeys([key1]));

    assert(!notaryContract.roles.owner.isAllowedForKeys([key1]));
    assert(!notaryContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!notaryContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    assertTrue(notaryContract.getExpiresAt().isAfter(ZonedDateTime.now().plusMonths(3)));
    assertTrue(notaryContract.getCreatedAt().isBefore(ZonedDateTime.now()));


    assertTrue(notaryContract.isPermitted("revoke", stepaPublicKeys));
    assertTrue(notaryContract.isPermitted("revoke", martyPublicKeys));

    assertTrue(notaryContract.isPermitted("change_owner", stepaPublicKeys));
    assertFalse(notaryContract.isPermitted("change_owner", martyPublicKeys));
});

unit.test("contractsservice_test: goodAttachDataToNotary", async () => {
    //List<String> fileName = new ArrayList<>(); //TODO
    //List<String> fileDesc = new ArrayList<>();

    fileName.add(rootPath + "../test/constraints/ReferencedConditions_contract1.yml");
    fileName.add(rootPath + "../test/constraints/ReferencedConditions_contract2.yml");
    fileDesc.add("ReferencedConditions_contract1.yml - description");
    fileDesc.add("ReferencedConditions_contract2.yml - description");

    let key1 = new crypto.PrivateKey(await (await io.openRead("../test/keys/marty_mcfly.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/test_payment_owner.private.unikey")).allBytes());

    let notaryContract = await cs.createNotaryContract([key1], [key2.publicKey], fileName, fileDesc);

    assert(await notaryContract.check());

    assert(notaryContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(notaryContract.roles.issuer.isAllowedForKeys([key1]));
    assert(notaryContract.roles.creator.isAllowedForKeys([key1]));

    assert(!notaryContract.roles.owner.isAllowedForKeys([key1]));
    assert(!notaryContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!notaryContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    assertTrue(notaryContract.getExpiresAt().isAfter(ZonedDateTime.now().plusMonths(3)));
    assertTrue(notaryContract.getCreatedAt().isBefore(ZonedDateTime.now()));

    assertTrue(notaryContract.isPermitted("revoke", stepaPublicKeys));
    assertTrue(notaryContract.isPermitted("revoke", martyPublicKeys));

    assertTrue(notaryContract.isPermitted("change_owner", stepaPublicKeys));
    assertFalse(notaryContract.isPermitted("change_owner", martyPublicKeys));

    let files = notaryContract.getDefinition().getData().getBinder("files");
    assertEquals(files.getBinder("ReferencedConditions_contract1_yml").getString("file_name"),
        "ReferencedConditions_contract1.yml");
    assertEquals(files.getBinder("ReferencedConditions_contract1_yml").getString("file_description"),
        "ReferencedConditions_contract1.yml - description");
    assertEquals(files.getBinder("ReferencedConditions_contract2_yml").getString("file_name"),
        "ReferencedConditions_contract2.yml");
    assertEquals(files.getBinder("ReferencedConditions_contract2_yml").getString("file_description"),
        "ReferencedConditions_contract2.yml - description");

    let notaryDeserialized = DefaultBiMapper.deserialize(BossBiMapper.serialize(notaryContract));
    assertTrue(notaryContract.getDefinition().getData().equals(notaryDeserialized.getDefinition().getData()));

    // checking by ContractsService.checkAttachNotaryContract
    assert(cs.checkAttachNotaryContract(notaryContract, "../test/constraints/ReferencedConditions_contract1.yml"));
    assert(cs.checkAttachNotaryContract(notaryContract, "../test/constraints/ReferencedConditions_contract1.yml"));
    assert(cs.checkAttachNotaryContract(notaryContract, "../test/constraints"));
    assert(cs.checkAttachNotaryContract(notaryContract, "../test/constraints/"));
    assert(!cs.checkAttachNotaryContract(notaryContract, "/references/subscriptionReference.yml"));
    assert(!cs.checkAttachNotaryContract(notaryContract, "/roles/link.yml"));
    assert(!cs.checkAttachNotaryContract(notaryContract, "/roles/"));
    assert(!cs.checkAttachNotaryContract(notaryContract, "/roles"));

});

unit.test("contractsservice_test: goodToken", async () => {
    let key1 = new crypto.PrivateKey(await (await io.openRead("../test/keys/marty_mcfly.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/test_payment_owner.private.unikey")).allBytes());

    let tokenContract = cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("100"));

    assert(await tokenContract.check());

    assert(tokenContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(tokenContract.roles.issuer.isAllowedForKeys([key1]));
    assert(tokenContract.roles.creator.isAllowedForKeys([key1]));

    assert(!tokenContract.roles.owner.isAllowedForKeys([key1]));
    assert(!tokenContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!tokenContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    assertTrue(tokenContract.getExpiresAt().isAfter(ZonedDateTime.now().plusMonths(3)));
    assertTrue(tokenContract.getCreatedAt().isBefore(ZonedDateTime.now()));

    assertEquals(InnerContractsService.getDecimalField(tokenContract, "amount"), new Decimal(100));

    assert(tokenContract.definition.permissions.get("split_join").size === 1);

    let splitJoinParams = tokenContract.definition.permissions.get("split_join").iterator().next().param;
    assertEquals(splitJoinParams.get("min_value"), "0.01");
    assertEquals(splitJoinParams.get("min_unit"), "0.01");
    assertEquals(splitJoinParams.get("field_name"), "amount");
    assertTrue(splitJoinParams.get("join_match_fields") instanceof List);
    assertEquals((splitJoinParams.get("join_match_fields")).get(0), "state.origin");


    assertTrue(tokenContract.isPermitted("revoke", stepaPublicKeys));
    assertTrue(tokenContract.isPermitted("revoke", martyPublicKeys));

    assertTrue(tokenContract.isPermitted("change_owner", stepaPublicKeys));
    assertFalse(tokenContract.isPermitted("change_owner", martyPublicKeys));

    assertTrue(tokenContract.isPermitted("split_join", stepaPublicKeys));
    assertFalse(tokenContract.isPermitted("split_join", martyPublicKeys));
});

unit.test("contractsservice_test: goodToken", async () => {
    let key1 = new crypto.PrivateKey(await (await io.openRead("../test/keys/marty_mcfly.private.unikey")).allBytes());
    let key2 = new crypto.PrivateKey(await (await io.openRead("../test/keys/test_payment_owner.private.unikey")).allBytes());

    let shareContract = cs.createShareContract([key1], [key2.publicKey], new BigDecimal("100"));

    assert(await shareContract.check());

    assert(shareContract.roles.owner.isAllowedForKeys([key2.publicKey]));
    assert(shareContract.roles.issuer.isAllowedForKeys([key1]));
    assert(shareContract.roles.creator.isAllowedForKeys([key1]));

    assert(!shareContract.roles.owner.isAllowedForKeys([key1]));
    assert(!shareContract.roles.issuer.isAllowedForKeys([key2.publicKey]));
    assert(!shareContract.roles.creator.isAllowedForKeys([key2.publicKey]));

    assertTrue(shareContract.getExpiresAt().isAfter(ZonedDateTime.now().plusMonths(3)));
    assertTrue(shareContract.getCreatedAt().isBefore(ZonedDateTime.now()));

    assertEquals(cs.getDecimalField(shareContract, "amount"), new Decimal(100));

    assertEquals(shareContract.getPermissions().get("split_join").size(), 1);

    let splitJoinParams = shareContract.getPermissions().get("split_join").iterator().next().getParams();
    assertEquals(splitJoinParams.get("min_value"), 1);
    assertEquals(splitJoinParams.get("min_unit"), 1);
    assertEquals(splitJoinParams.get("field_name"), "amount");
    assertTrue(splitJoinParams.get("join_match_fields") instanceof List);
    assertEquals((splitJoinParams.get("join_match_fields")).get(0), "state.origin");


    assertTrue(shareContract.isPermitted("revoke", stepaPublicKeys));
    assertTrue(shareContract.isPermitted("revoke", martyPublicKeys));

    assertTrue(shareContract.isPermitted("change_owner", stepaPublicKeys));
    assertFalse(shareContract.isPermitted("change_owner", martyPublicKeys));

    assertTrue(shareContract.isPermitted("split_join", stepaPublicKeys));
    assertFalse(shareContract.isPermitted("split_join", martyPublicKeys));*/
});
