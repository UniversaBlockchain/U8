import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import * as t from 'tools'
import * as tk from 'unit_tests/test_keys'



unit.test("simple role serialization", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    role.requiredAnyConstraints.add("ref1");

    let s = await role.serialize(dbm.DefaultBiMapper.getInstance());

    let role2 = new roles.SimpleRole();
    await role2.deserialize(s, dbm.DefaultBiMapper.getInstance());
    assert(t.valuesEqual(role,role2))
});


unit.test("simple role with address", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    assert(role.isAllowedForKeys([k.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey]));

});

unit.test("simple role with key", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    assert(role.isAllowedForKeys([k.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey]));

});

unit.test("simple role with key and address", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();

    let role = new roles.SimpleRole("name",[k2.publicKey,k.publicKey.longAddress]);
    assert(role.isAllowedForKeys([k.publicKey,k2.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey]));
    assert(!role.isAllowedForKeys([k.publicKey]));

});