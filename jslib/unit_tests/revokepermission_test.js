import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import  * as tp from 'transactionpack'
import * as t from 'tools'


unit.test("revoke permission serialization", async () => {
    let k = await crypto.PrivateKey.generate(2048);
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let role2 = new roles.SimpleRole("name",k.publicKey.longAddress);

    let rp = new perm.RevokePermission(role);
    let rp2 = dbm.DefaultBiMapper.getInstance().deserialize(dbm.DefaultBiMapper.getInstance().serialize(rp));
    let rp3 = new perm.RevokePermission(role2);
    assert(t.valuesEqual(rp,rp2));
    assert(!t.valuesEqual(rp,rp3));

});


unit.test("revoke permission check", async () => {
    let k = await crypto.PrivateKey.generate(2048);
    let k2 = await crypto.PrivateKey.generate(2048);

    let c1 = cnt.Contract.fromPrivateKey(k);
    let role = new roles.SimpleRole("name",k2.publicKey.longAddress);

    let rp = new perm.RevokePermission(role);
    c1.definition.addPermission(rp);
    await c1.seal(true);
    assert(await c1.check());

    let c2_1 = cnt.Contract.fromPrivateKey(k2);
    let c2_2 = cnt.Contract.fromPrivateKey(k);
    c2_1.revokingItems.add(c1);
    c2_2.revokingItems.add(c1);


    await c2_1.seal(true);
    await c2_2.seal(true);

    assert(await c2_1.check());
    assert(!await c2_2.check());



});