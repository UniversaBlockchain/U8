/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const roles = require('roles');
const perms = require('permissions');
const cs = require("contractsservice");
const e = require("errors");
const Errors = e.Errors;
const tt = require("test_tools");
const Constraint = require('constraint').Constraint;
const TransactionPack = require("transactionpack").TransactionPack;
const BigDecimal  = require("big").Big;
const NSmartContract = require("services/NSmartContract").NSmartContract;
const FollowerContract = require("services/followerContract").FollowerContract;
const SlotContract = require("services/slotContract").SlotContract;
const UnsContract = require("services/unsContract").UnsContract;

const root_path = "../test/contractsservice/";

async function checkCreateParcel(contract_file_payload, contract_file_payment, checkGood = false) {
    let privateKey = tk.TestKeys.getKey();

    let payment = await Contract.fromDslFile(root_path + contract_file_payment);
    payment.keysToSignWith.add(privateKey);
    await payment.seal(true);

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let parcel = await cs.createParcel(payload, payment, 20, [privateKey]);

    await tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.branchId === payment.state.branchId);
    assert(parcel.getPaymentContract().definition.data.equals(payment.definition.data));

    if (checkGood)
        assert(parcel.getPaymentContract().state.data.transaction_units === 100 - 20);
}

async function checkCreateParcelFotTestNet(contract_file_payload) {
    let privateKey = tk.TestKeys.getKey();

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let payment = await tt.createFreshU(100, [privateKey.publicKey], true);

    let parcel = await cs.createParcel(payload, payment, 20, [privateKey], true);

    await tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.data.transaction_units === 100);
    assert(parcel.getPaymentContract().state.data.test_transaction_units === 10000 - 20);
}

async function checkCreatePayingParcel(contract_file_payload, contract_file_payment, checkGood = false) {
    let privateKey = tk.TestKeys.getKey();

    let payment = await Contract.fromDslFile(root_path + contract_file_payment);
    payment.keysToSignWith.add(privateKey);
    await payment.seal(true);

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let parcel = await cs.createPayingParcel(payload.transactionPack, payment, 20, 30, [privateKey]);

    await tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.branchId === payment.state.branchId);
    assert(parcel.getPaymentContract().definition.data.equals(payment.definition.data));

    if (checkGood) {
        assert(parcel.getPaymentContract().state.data.transaction_units === 100 - 20);
        assert(Array.from(parcel.getPayloadContract().newItems)[0].state.data.transaction_units === 100 - 20 - 30);
    }
}

async function checkCreatePayingParcelFotTestNet(contract_file_payload) {
    let privateKey = tk.TestKeys.getKey();

    let payload = await Contract.fromDslFile(root_path + contract_file_payload);
    payload.keysToSignWith.add(privateKey);
    await payload.seal(true);

    let payment = await tt.createFreshU(100, [privateKey.publicKey], true);

    let parcel = await cs.createPayingParcel(payload.transactionPack, payment, 20, 30, [privateKey], true);

    await tt.assertSameContracts(parcel.getPayloadContract(), payload);

    assert(parcel.getPaymentContract().state.data.transaction_units === 100);
    assert(parcel.getPaymentContract().state.data.test_transaction_units === 10000 - 20);
    assert(Array.from(parcel.getPayloadContract().newItems)[0].state.data.test_transaction_units === 10000 - 20 - 30);
}

async function simpleCheckContract(contract, issuerKey, ownerKey) {
    assert(await contract.check());

    assert(contract.roles.owner.isAllowedForKeys([ownerKey.publicKey]));
    assert(contract.roles.issuer.isAllowedForKeys([issuerKey]));
    assert(contract.roles.creator.isAllowedForKeys([issuerKey]));

    assert(!contract.roles.owner.isAllowedForKeys([issuerKey]));
    assert(!contract.roles.issuer.isAllowedForKeys([ownerKey.publicKey]));
    assert(!contract.roles.creator.isAllowedForKeys([ownerKey.publicKey]));

    let date = new Date();
    date.setMonth(date.getMonth() + 50);
    assert(contract.getExpiresAt().getTime() > date.getTime());
    assert(contract.definition.createdAt.getTime() < Date.now());

    assert(contract.isPermitted("revoke", [ownerKey.publicKey]));
    assert(contract.isPermitted("revoke", [issuerKey.publicKey]));

    assert(contract.isPermitted("change_owner", [ownerKey.publicKey]));
    assert(!contract.isPermitted("change_owner", [issuerKey.publicKey]));
}

unit.test("contractsservice_test: badRevoke", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

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
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");

    c.keysToSignWith.add(key);
    c.registerRole(new roles.SimpleRole("owner", key));

    await c.seal(true);

    let revokeContract = await cs.createRevocation(c, key);

    assert(await revokeContract.check());
});

unit.test("contractsservice_test: checkCreateGoodParcel", async () => {
    await checkCreateParcel("simple_root_contract.yml", "simple_root_contract.yml", true);
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

unit.test("contractsservice_test: checkCreateGoodPayingParcel", async () => {
    await checkCreatePayingParcel("simple_root_contract.yml", "simple_root_contract.yml", true);
});

unit.test("contractsservice_test: checkCreatePayingParcelBadPayload", async () => {
    await checkCreatePayingParcel("bad_contract_payload.yml", "simple_root_contract.yml");
});

unit.test("contractsservice_test: checkCreatePayingParcelBadPayment", async () => {
    await checkCreatePayingParcel("simple_root_contract.yml","bad_contract_payment.yml");
});

unit.test("contractsservice_test: checkCreateGoodPayingParcelForTestNet", async () => {
    await checkCreatePayingParcelFotTestNet("simple_root_contract.yml");
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

    await simpleCheckContract(notaryContract, key1, key2);
});

unit.test("contractsservice_test: goodAttachDataToNotary", async () => {
    let fileName = ["../test/constraints/ReferencedConditions_contract1.yml",
        "../test/constraints/ReferencedConditions_contract2.yml" ];

    let fileDesc = ["ReferencedConditions_contract1.yml - description",
        "ReferencedConditions_contract2.yml - description"];

    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let notaryContract = await cs.createNotaryContract([key1], [key2.publicKey], fileName, fileDesc);

    await simpleCheckContract(notaryContract, key1, key2);

    let files = notaryContract.definition.data.files;
    assert(files["ReferencedConditions_contract1_yml"]["file_name"] === "ReferencedConditions_contract1.yml");
    assert(files["ReferencedConditions_contract1_yml"]["file_description"] === "ReferencedConditions_contract1.yml - description");
    assert(files["ReferencedConditions_contract2_yml"]["file_name"] === "ReferencedConditions_contract2.yml");
    assert(files["ReferencedConditions_contract2_yml"]["file_description"] === "ReferencedConditions_contract2.yml - description");

    let notaryDeserialized = await DefaultBiMapper.getInstance().deserialize(await BossBiMapper.getInstance().serialize(notaryContract));
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

    await simpleCheckContract(tokenContract, key1, key2);

    assert(tokenContract.state.data["amount"] === "100");
    assert(tokenContract.definition.permissions.get("split_join").length === 1);

    let splitJoinParams = tokenContract.definition.permissions.get("split_join")[0].params;
    assert(splitJoinParams.min_value === "0.01");
    assert(splitJoinParams.min_unit === "0.01");
    assert(splitJoinParams.field_name === "amount");
    assert(splitJoinParams.join_match_fields instanceof Array);
    assert(splitJoinParams.join_match_fields.length === 1);
    assert(splitJoinParams.join_match_fields[0] === "state.origin");

    assert(tokenContract.isPermitted("split_join", [key2.publicKey]));
    assert(!tokenContract.isPermitted("split_join", [key1.publicKey]));
});

unit.test("contractsservice_test: goodMintableToken", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createMintableTokenContract([key1], [key2.publicKey], new BigDecimal("100"));

    await simpleCheckContract(tokenContract, key1, key2);

    assert(tokenContract.state.data["amount"] === "100");
    assert(tokenContract.definition.permissions.get("split_join").length === 1);

    let splitJoinParams = tokenContract.definition.permissions.get("split_join")[0].params;
    assert(splitJoinParams.min_value === "0.01");
    assert(splitJoinParams.min_unit === "0.01");
    assert(splitJoinParams.field_name === "amount");
    assert(splitJoinParams.join_match_fields instanceof Array);
    assert(splitJoinParams.join_match_fields.length === 2);
    assert(splitJoinParams.join_match_fields[0] === "definition.data.currency");
    assert(splitJoinParams.join_match_fields[1] === "definition.issuer");

    assert(tokenContract.isPermitted("split_join", [key2.publicKey]));
    assert(!tokenContract.isPermitted("split_join", [key1.publicKey]));
});

unit.test("contractsservice_test: goodShare", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let shareContract = await cs.createShareContract([key1], [key2.publicKey], new BigDecimal("100"));

    await simpleCheckContract(shareContract, key1, key2);

    assert(shareContract.state.data["amount"] === "100");
    assert(shareContract.definition.permissions.get("split_join").length === 1);

    let splitJoinParams = shareContract.definition.permissions.get("split_join")[0].params;
    assert(splitJoinParams.min_value === 1);
    assert(splitJoinParams.min_unit === 1);
    assert(splitJoinParams.field_name === "amount");
    assert(splitJoinParams.join_match_fields instanceof Array);
    assert(splitJoinParams.join_match_fields.length === 1);
    assert(splitJoinParams.join_match_fields[0] === "state.origin");

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
    assert(Errors.FORBIDDEN === splitContract.errors[0].error);

    splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2]);

    // not signed by creator (key1)
    assert(!await splitContract.check());
    assert(Errors.NOT_SIGNED === splitContract.errors[0].error);
});

unit.test("contractsservice_test: badSplitHackAmount", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2], true);

    // hack amount
    splitContract.state.data.amount = "750";
    await splitContract.seal(true);

    assert(!await splitContract.check());
    assert(Errors.FORBIDDEN === splitContract.errors[0].error);
});

unit.test("contractsservice_test: goodSplit", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2], true);

    assert(await splitContract.check());

    assert(splitContract.state.data.amount === "744");
    assert(Array.from(splitContract.newItems)[0].state.data.amount === "256");
    assert(Array.from(splitContract.revokingItems)[0].state.data.amount === "1000");
});

unit.test("contractsservice_test: badJoin", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2], true);

    assert(await splitContract.check());

    assert(splitContract.state.data.amount === "744");
    assert(Array.from(splitContract.newItems)[0].state.data.amount === "256");
    assert(Array.from(splitContract.revokingItems)[0].state.data.amount === "1000");

    let joinContract = await cs.createJoin(splitContract, Array.from(splitContract.newItems)[0],"amount", [key1]);

    // not permitted split by owner (key2)
    assert(!await joinContract.check());
    assert(Errors.NOT_SIGNED === joinContract.errors[0].error);

    joinContract = await cs.createJoin(splitContract, Array.from(splitContract.newItems)[0],"amount", [key2]);

    // hack amount
    joinContract.state.data.amount = "1200";

    await joinContract.seal(true);

    assert(!await joinContract.check());
    assert(Errors.FORBIDDEN === joinContract.errors[0].error);
});

unit.test("contractsservice_test: goodJoin", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContract = await cs.createSplit(tokenContract, 256, "amount", [key2], true);

    assert(await splitContract.check());

    assert(splitContract.state.data.amount === "744");
    assert(Array.from(splitContract.newItems)[0].state.data.amount === "256");
    assert(Array.from(splitContract.revokingItems)[0].state.data.amount === "1000");

    let joinContract = await cs.createJoin(splitContract, Array.from(splitContract.newItems)[0],"amount", [key2]);

    assert(await joinContract.check());

    assert(joinContract.state.data.amount === "1000");
});

unit.test("contractsservice_test: badSplitJoinWithChangeJoinMatchingField", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract = await cs.createMintableTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    tokenContract.definition.permissions.delete("split_join");

    let ownerLink = new roles.RoleLink("@owner_link", "owner");
    ownerLink.contract = tokenContract;

    let params = {
        min_value: "0.01",
        min_unit: "0.01",
        field_name: "amount",
        join_match_fields: ["state.data.currency"]
    };

    tokenContract.definition.addPermission(new perms.SplitJoinPermission(ownerLink, params));
    tokenContract.definition.addPermission(new perms.ModifyDataPermission(ownerLink, {fields : {currency : null}}));

    tokenContract.state.data.currency = "CUR";

    await tokenContract.seal(true);
    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");

    let splitContracts = await cs.createSplitJoin([tokenContract], [256, 256],
        [key2.longAddress, key2.shortAddress], [key2], "amount");

    // change join_match_field
    splitContracts[2].state.data.currency = "NOT";

    // hack amount
    splitContracts[0].state.data.amount = "300";
    splitContracts[1].state.data.amount = "700";
    splitContracts[2].state.data.amount = "1000";

    await splitContracts[0].seal(true);

    assert(!await splitContracts[0].check());
    assert(Errors.FORBIDDEN === splitContracts[0].errors[0].error);
});

unit.test("contractsservice_test: goodSplitJoin", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let tokenContract1 = await cs.createMintableTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));
    let tokenContract2 = await cs.createMintableTokenContract([key1], [key2.publicKey], new BigDecimal("500"));

    assert(await tokenContract1.check());
    assert(await tokenContract2.check());

    assert(tokenContract1.state.data.amount === "1000");
    assert(tokenContract2.state.data.amount === "500");

    let splitContracts = await cs.createSplitJoin([tokenContract1, tokenContract2], [12, 256, 888],
        [key2.longAddress, key2.shortAddress, key1.longAddress], [key2], "amount");

    assert(await splitContracts[0].check());

    assert(splitContracts[0].state.data.amount === "344");
    assert(splitContracts[1].state.data.amount === "12");
    assert(splitContracts[2].state.data.amount === "256");
    assert(splitContracts[3].state.data.amount === "888");

    assert(Array.from(splitContracts[0].roles.owner.keyRecords.keys())[0].equals(key2.publicKey));
    assert(Array.from(splitContracts[1].roles.owner.keyAddresses)[0].equals(key2.longAddress));
    assert(Array.from(splitContracts[2].roles.owner.keyAddresses)[0].equals(key2.shortAddress));
    assert(Array.from(splitContracts[3].roles.owner.keyAddresses)[0].equals(key1.longAddress));
});

unit.test("contractsservice_test: goodSwap", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();
    let key3 = tk.TestKeys.getKey();
    let key4 = tk.TestKeys.getKey();

    let tokenContract1 = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));
    let tokenContract2 = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("2000"));
    let tokenContract3 = await cs.createTokenContract([key3], [key4.publicKey], new BigDecimal("100"));
    let tokenContract4 = await cs.createTokenContract([key3], [key4.publicKey], new BigDecimal("500"));

    assert(await tokenContract1.check());
    assert(await tokenContract2.check());
    assert(await tokenContract3.check());
    assert(await tokenContract4.check());

    let swapContract = await cs.startSwap([tokenContract1, tokenContract2],
        [tokenContract3, tokenContract4], [key2], [key4.publicKey], true);

    // without signatures
    assert(!await swapContract.check());

    await swapContract.addSignatureToSeal(key2);

    // signed by only first side
    assert(!await swapContract.check());

    await swapContract.addSignatureToSeal(key4);

    // signed by all sides
    assert(await swapContract.check());

    // check swapped contracts
    let swapped = Array.from(swapContract.newItems);
    assert(swapped[0].state.data.amount === "1000" || swapped[0].state.data.amount === "2000");
    assert(swapped[1].state.data.amount === "1000" || swapped[1].state.data.amount === "2000");
    assert(swapped[2].state.data.amount === "100" || swapped[2].state.data.amount === "500");
    assert(swapped[3].state.data.amount === "100" || swapped[3].state.data.amount === "500");

    assert(swapped[0].roles.owner.isAllowedForKeys([key4]));
    assert(swapped[1].roles.owner.isAllowedForKeys([key4]));
    assert(swapped[2].roles.owner.isAllowedForKeys([key2]));
    assert(swapped[3].roles.owner.isAllowedForKeys([key2]));
    assert(!swapped[0].roles.owner.isAllowedForKeys([key2]));
    assert(!swapped[1].roles.owner.isAllowedForKeys([key2]));
    assert(!swapped[2].roles.owner.isAllowedForKeys([key4]));
    assert(!swapped[3].roles.owner.isAllowedForKeys([key4]));
});

unit.test("contractsservice_test: goodTwoSignedContract", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();
    let key3 = tk.TestKeys.getKey();

    let tokenContract = await cs.createTokenContract([key1], [key2.publicKey], new BigDecimal("1000"));

    assert(await tokenContract.check());

    assert(tokenContract.state.data.amount === "1000");
    assert(tokenContract.roles.owner.isAllowedForKeys([key2]));

    let twoSignedContract = await cs.createTwoSignedContract(tokenContract, [key2], [key3.publicKey], true);

    // without signatures
    assert(!await twoSignedContract.check());

    await twoSignedContract.addSignatureToSeal(key2);

    // signed by only first side
    assert(!await twoSignedContract.check());

    await twoSignedContract.addSignatureToSeal(key3);

    // signed by all sides
    assert(await twoSignedContract.check());

    // check two-signed contract
    assert(twoSignedContract.state.data.amount === "1000");
    assert(twoSignedContract.roles.owner.isAllowedForKeys([key3]));
});

unit.test("contractsservice_test: createSlotContract", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let slotContract = await cs.createSlotContract([key1], [key2.publicKey], tt.createNodeInfoProvider());

    await simpleCheckContract(slotContract, key1, key2);

    assert(slotContract.definition.extendedType === NSmartContract.SmartContractType.SLOT1);

    let mdp = slotContract.definition.permissions.get("modify_data");
    assert(mdp != null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));
    assert(mdp[0].fields.hasOwnProperty("/expires_at"));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.KEEP_REVISIONS_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.PAID_U_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.PREPAID_KD_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.PREPAID_FROM_TIME_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.STORED_BYTES_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.SPENT_KD_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.SPENT_KD_TIME_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(SlotContract.TRACKING_CONTRACT_FIELD_NAME));
});

// unit.test("contractsservice_test: createUnsContract", async () => {
//     let key1 = tk.TestKeys.getKey();
//     let key2 = tk.TestKeys.getKey();
//
//     let unsContract = await cs.createUnsContract([key1], [key2.publicKey], tt.createNodeInfoProvider());
//
//     await simpleCheckContract(unsContract, key1, key2);
//
//     assert(unsContract.definition.extendedType === NSmartContract.SmartContractType.UNS1);
//
//     let mdp = unsContract.definition.permissions.get("modify_data");
//     assert(mdp !== null);
//     assert(mdp instanceof Array);
//     assert(mdp[0].fields.hasOwnProperty("action"));
//     assert(mdp[0].fields.hasOwnProperty("/expires_at"));
//     assert(mdp[0].fields.hasOwnProperty("/references"));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.NAMES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PAID_U_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FROM_TIME_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.STORED_ENTRIES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_TIME_FIELD_NAME));
// });
//
// unit.test("contractsservice_test: createUnsContractForRegisterContractName", async () => {
//     let namedContract = Contract.fromPrivateKey(tk.TestKeys.getKey());
//     await namedContract.seal(true);
//     assert(await namedContract.check());
//
//     let key1 = tk.TestKeys.getKey();
//     let key2 = tk.TestKeys.getKey();
//
//     let unsContract = await cs.createUnsContractForRegisterContractName([key1], [key2.publicKey],
//         tt.createNodeInfoProvider(), "testUnsContract", "test description", "http://test.com", namedContract);
//
//     await simpleCheckContract(unsContract, key1, key2);
//
//     assert(unsContract.definition.extendedType === NSmartContract.SmartContractType.UNS1);
//
//     let mdp = unsContract.definition.permissions.get("modify_data");
//     assert(mdp !== null);
//     assert(mdp instanceof Array);
//     assert(mdp[0].fields.hasOwnProperty("action"));
//     assert(mdp[0].fields.hasOwnProperty("/expires_at"));
//     assert(mdp[0].fields.hasOwnProperty("/references"));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.NAMES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PAID_U_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FROM_TIME_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.STORED_ENTRIES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_TIME_FIELD_NAME));
//
//     assert(unsContract.getUnsName("testUnsContract").unsName === "testUnsContract");
//     assert(unsContract.getUnsName("testUnsContract").unsDescription === "test description");
//     assert(unsContract.getUnsName("testUnsContract").unsURL === "http://test.com");
//
//     assert(unsContract.getUnsName("testUnsContract").findUnsRecordByOrigin(namedContract.getOrigin()) !== -1);
// });
//
// unit.test("contractsservice_test: createUnsContractForRegisterKeyName", async () => {
//     let namedKey = tk.TestKeys.getKey();
//
//     let key1 = tk.TestKeys.getKey();
//     let key2 = tk.TestKeys.getKey();
//
//     let unsContract = await cs.createUnsContractForRegisterKeyName([key1], [key2.publicKey],
//         tt.createNodeInfoProvider(), "testUnsContract", "test description", "http://test.com", namedKey);
//
//     await simpleCheckContract(unsContract, key1, key2);
//
//     assert(unsContract.definition.extendedType === NSmartContract.SmartContractType.UNS1);
//
//     let mdp = unsContract.definition.permissions.get("modify_data");
//     assert(mdp !== null);
//     assert(mdp instanceof Array);
//     assert(mdp[0].fields.hasOwnProperty("action"));
//     assert(mdp[0].fields.hasOwnProperty("/expires_at"));
//     assert(mdp[0].fields.hasOwnProperty("/references"));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.NAMES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PAID_U_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.PREPAID_ND_FROM_TIME_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.STORED_ENTRIES_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_FIELD_NAME));
//     assert(mdp[0].fields.hasOwnProperty(UnsContract.SPENT_ND_TIME_FIELD_NAME));
//
//     assert(unsContract.getUnsName("testUnsContract").findUnsRecordByKey(namedKey.publicKey) !== -1);
//     assert(unsContract.getUnsName("testUnsContract").findUnsRecordByAddress(new crypto.KeyAddress(namedKey.publicKey, 0, true)) !== -1);
//     assert(unsContract.getUnsName("testUnsContract").findUnsRecordByAddress(new crypto.KeyAddress(namedKey.publicKey, 0, false)) !== -1);
// });

unit.test("contractsservice_test: createFollowerContract", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let followerContract = await cs.createFollowerContract([key1], [key2.publicKey], tt.createNodeInfoProvider());

    await simpleCheckContract(followerContract, key1, key2);

    assert(followerContract.definition.extendedType === NSmartContract.SmartContractType.FOLLOWER1);

    let mdp = followerContract.definition.permissions.get("modify_data");
    assert(mdp !== null);
    assert(mdp instanceof Array);
    assert(mdp[0].fields.hasOwnProperty("action"));
    assert(mdp[0].fields.hasOwnProperty("/expires_at"));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.PAID_U_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.PREPAID_OD_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.PREPAID_FROM_TIME_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.FOLLOWED_ORIGINS_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.SPENT_OD_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.SPENT_OD_TIME_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.CALLBACK_RATE_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.TRACKING_ORIGINS_FIELD_NAME));
    assert(mdp[0].fields.hasOwnProperty(FollowerContract.CALLBACK_KEYS_FIELD_NAME));
});

unit.test("contractsservice_test: addConstraintToContract", async () => {
    let key = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/_xer0yfe2nn1xthc.private.unikey"));

    let c = await Contract.fromDslFile("../test/simple_root_contract.yml");
    c.definition.data.const = "qwerty";
    c.keysToSignWith.add(key);
    await c.seal(true);
    assert(await c.check());

    let ref = Contract.fromPrivateKey(key);
    await ref.seal(true);
    assert(await ref.check());

    await cs.addConstraintToContract(c, ref, "testConstraint", Constraint.TYPE_EXISTING_STATE,
        ["this.definition.data.const == ref.state.data.value"], true);

    let c1 = c.findConstraintByName("testConstraint");
    let c2 = c.findConstraintByNameInSection("testConstraint", "state");
    let c3 = c.constraints.get("testConstraint");

    assert(c1.equals(c2));
    assert(c2.equals(c3));
    assert(c.findConstraintByNameInSection("testConstraint", "definition") == null);
    assert(c.findConstraintByNameInSection("testConstraint", "transactional") == null);
    assert(c.state.constraints.has(c1));
    assert(!c.definition.constraints.has(c1));

    c1.matchingItems.clear();

    assert(!await c.check());

    ref.state.data.value = "qwerty";
    assert(await c.check());
});

unit.test("contractsservice_test: createBatch", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();
    let key3 = tk.TestKeys.getKey();

    let c1 = Contract.fromPrivateKey(key1);
    await c1.seal(true);
    assert(await c1.check());

    let c2 = Contract.fromPrivateKey(key2);
    await c2.seal(true);
    assert(await c2.check());

    let batch = await cs.createBatch([key1, key2], c1, c2);

    assert(await batch.check());

    assert(batch.newItems.has(c1));
    assert(batch.newItems.has(c2));
    assert(batch.keysToSignWith.has(key1));
    assert(batch.keysToSignWith.has(key2));

    assert(batch.roles.owner.isAllowedForKeys([key1, key2]));
    assert(batch.roles.issuer.isAllowedForKeys([key1, key2]));
    assert(batch.roles.creator.isAllowedForKeys([key1, key2]));

    assert(!batch.roles.owner.isAllowedForKeys([key3]));
    assert(!batch.roles.issuer.isAllowedForKeys([key3]));
    assert(!batch.roles.creator.isAllowedForKeys([key3]));

    let date = new Date();
    date.setDate(date.getDate() + 2);
    assert(batch.getExpiresAt().getTime() > date.getTime());
    assert(batch.definition.createdAt.getTime() < Date.now());
});

unit.test("contractsservice_test: addConsent", async () => {
    let key1 = tk.TestKeys.getKey();
    let key2 = tk.TestKeys.getKey();

    let contract = Contract.fromPrivateKey(key1);
    await contract.seal(true);
    assert(await contract.check());

    let consent = await cs.addConsent(contract, key2.shortAddress);

    assert(!await consent.check());

    await contract.seal(true);
    assert(!await contract.check());

    await consent.addSignatureToSeal(key2);

    assert(await consent.check());

    contract.newItems.add(consent);

    await contract.seal(true);
    assert(await contract.check());

    assert(consent.roles.owner.isAllowedForKeys([key2]));
    assert(consent.roles.issuer.isAllowedForKeys([key2]));
    assert(consent.roles.creator.isAllowedForKeys([key2]));

    assert(!consent.roles.owner.isAllowedForKeys([key1]));
    assert(!consent.roles.issuer.isAllowedForKeys([key1]));
    assert(!consent.roles.creator.isAllowedForKeys([key1]));

    let date = new Date();
    date.setDate(date.getDate() + 9);
    assert(consent.getExpiresAt().getTime() > date.getTime());
    assert(consent.definition.createdAt.getTime() < Date.now());

    assert(consent.isPermitted("revoke", [key2]));
    assert(!consent.isPermitted("revoke", [key1]));

    assert(consent.isPermitted("change_owner", [key2]));
    assert(!consent.isPermitted("change_owner", [key1]));
});

unit.test("contractsservice_test: createRateLimitDisablingContract", async () => {
    let privateKey = tk.TestKeys.getKey();
    let unlimitKey = tk.TestKeys.getKey();

    let payment = await tt.createFreshU(100, [privateKey.publicKey], false);

    let rateLimitDisabling = await cs.createRateLimitDisablingContract(unlimitKey.publicKey, payment, 80, [privateKey]);

    assert(await rateLimitDisabling.check());

    assert(rateLimitDisabling.transactional.data.unlimited_key.equals(unlimitKey.publicKey.packed));
    assert(rateLimitDisabling.state.data.transaction_units === 20);
});