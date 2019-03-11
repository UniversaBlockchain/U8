import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import * as t from 'tools'



unit.test("list role serialization", async () => {
    let k = await crypto.PrivateKey.generate(2048);
    let role = new roles.ListRole("name");
    role.mode = roles.ListRoleMode.QUORUM;
    role.quorumSize = 3;
    role.roles.push(new roles.SimpleRole("name1",k.publicKey));
    role.roles.push(new roles.SimpleRole("name2",k.publicKey.longAddress));
    role.requiredAnyConstraints.add("ref1");



    let s = role.serialize(dbm.DefaultBiMapper.getInstance());

    let role2 = new roles.ListRole();
    role2.deserialize(s,dbm.DefaultBiMapper.getInstance());
    assert(t.valuesEqual(role,role2))
});


unit.test("list role ALL", async () => {
    let k1 = await crypto.PrivateKey.generate(2048);
    let k2 = await crypto.PrivateKey.generate(2048);
    let k3 = await crypto.PrivateKey.generate(2048);
    let role = new roles.ListRole("name");
    role.mode = roles.ListRoleMode.ALL;
    role.roles.push(new roles.SimpleRole("name1",k1.publicKey));
    role.roles.push(new roles.SimpleRole("name2",k2.publicKey.longAddress));
    role.roles.push(new roles.SimpleRole("name3",k3.publicKey.shortAddress));

    assert(role.isAllowedForKeys([k1.publicKey,k2.publicKey,k3.publicKey]));
    assert(!role.isAllowedForKeys([k1.publicKey,k3.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey,k3.publicKey]));
    assert(!role.isAllowedForKeys([k1.publicKey,k2.publicKey]));
});

unit.test("list role ANY", async () => {
    let k1 = await crypto.PrivateKey.generate(2048);
    let k2 = await crypto.PrivateKey.generate(2048);
    let k3 = await crypto.PrivateKey.generate(2048);
    let role = new roles.ListRole("name");
    role.mode = roles.ListRoleMode.ANY;
    role.roles.push(new roles.SimpleRole("name1",k1.publicKey));
    role.roles.push(new roles.SimpleRole("name2",k2.publicKey.longAddress));

    assert(role.isAllowedForKeys([k1.publicKey,k2.publicKey,k3.publicKey]));
    assert(role.isAllowedForKeys([k1.publicKey,k3.publicKey]));
    assert(role.isAllowedForKeys([k2.publicKey,k3.publicKey]));
    assert(!role.isAllowedForKeys([k3.publicKey]));

});

unit.test("list role QUORUM", async () => {
    let k1 = await crypto.PrivateKey.generate(2048);
    let k2 = await crypto.PrivateKey.generate(2048);
    let k3 = await crypto.PrivateKey.generate(2048);
    let k4 = await crypto.PrivateKey.generate(2048);
    let role = new roles.ListRole("name");
    role.mode = roles.ListRoleMode.QUORUM;
    role.quorumSize = 2;
    role.roles.push(new roles.SimpleRole("name1",k1.publicKey));
    role.roles.push(new roles.SimpleRole("name2",k2.publicKey.longAddress));
    role.roles.push(new roles.SimpleRole("name3",k3.publicKey.shortAddress));

    assert(role.isAllowedForKeys([k1.publicKey,k2.publicKey,k3.publicKey]));
    assert(role.isAllowedForKeys([k1.publicKey,k3.publicKey]));
    assert(role.isAllowedForKeys([k2.publicKey,k3.publicKey]));
    assert(role.isAllowedForKeys([k2.publicKey,k1.publicKey]));
    assert(!role.isAllowedForKeys([k3.publicKey]));
    assert(!role.isAllowedForKeys([k1.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey]));
    assert(!role.isAllowedForKeys([k2.publicKey,k4.publicKey]));

});