/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as bbm from 'bossbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import * as t from 'tools'
import * as d from 'deltas'
import * as tk from 'unit_tests/test_keys'

const tt = require("test_tools");

unit.test("contract copy test", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("owner",k.publicKey.shortAddress);
    role.keyAddresses.add(k.publicKey.shortAddress);
    c1.registerRole(role);

    let mdp = new perm.RevokePermission(role);
    c1.definition.addPermission(mdp);

    await c1.seal(true);

    let c2 = await c1.copy();

    let s1 = await bbm.BossBiMapper.getInstance().serialize(c1);
    let s2 = await bbm.BossBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(s1,s2));
    assert(d.Delta.between(null,s1,s2) == null);

    let ds1 = await dbm.DefaultBiMapper.getInstance().serialize(c1);
    let ds2 = await dbm.DefaultBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(ds1,ds2));
    assert(d.Delta.between(null,ds1,ds2) == null);
});

unit.test("contract packing test", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("owner",k.publicKey.shortAddress);
    role.keyAddresses.add(k.publicKey.shortAddress);
    c1.registerRole(role);

    let bb = await c1.seal();

    let c2 = await cnt.Contract.fromSealedBinary(bb);

    await tt.assertSameContracts(c1, c2);
});

unit.test("transactionPack packing test", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("owner",k.publicKey.shortAddress);
    role.keyAddresses.add(k.publicKey.shortAddress);
    c1.registerRole(role);

    await c1.seal();

    let bb = await c1.getPackedTransaction();

    let c2 = await cnt.Contract.fromPackedTransaction(bb);

    await tt.assertSameContracts(c1, c2);
});

unit.test("unpack contract from fromPackedTransaction", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("owner",k.publicKey.shortAddress);
    role.keyAddresses.add(k.publicKey.shortAddress);
    c1.registerRole(role);

    let bb = await c1.seal();

    let c2 = await cnt.Contract.fromPackedTransaction(bb);

    await tt.assertSameContracts(c1, c2);
});

unit.test("contract custom roles", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("qwerty123", k.publicKey.longAddress);
    //role.keyAddresses.add(k.publicKey.longAddress);
    c1.registerRole(role);

    let link = new roles.RoleLink("owner", "qwerty123");
    c1.registerRole(link);

    await c1.seal();

    let bb = await c1.getPackedTransaction();
    let c2 = await cnt.Contract.fromPackedTransaction(bb);

    let r = c2.roles.owner.resolve();

    assert(r.name === "qwerty123");
    assert(r instanceof roles.SimpleRole);
    assert(roles.RoleExtractor.extractAddresses(r).has(k.publicKey.longAddress));
});