import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import  * as tp from 'transactionpack'
import * as t from 'tools'
import * as tk from 'unit_tests/test_keys'



unit.test("change owner permission serialization", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let role2 = new roles.SimpleRole("name",k.publicKey.longAddress);

    let cop = new perm.ChangeOwnerPermission(role);
    let cop2 = dbm.DefaultBiMapper.getInstance().deserialize(dbm.DefaultBiMapper.getInstance().serialize(cop));
    let cop3 = new perm.ChangeOwnerPermission(role2);
    assert(t.valuesEqual(cop,cop2));
    assert(!t.valuesEqual(cop,cop3));

});


unit.test("change owner permission check", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();

    let c1 = cnt.Contract.fromPrivateKey(k);
    await c1.seal(true);
    assert(await c1.check());
    let c2_1 = c1.createRevision([k]);
    let c2_2 = c1.createRevision([k2]);

    let newowner = new roles.SimpleRole("owner",k2.publicKey.longAddress);
    let newowner2 = new roles.SimpleRole("owner",k2.publicKey.shortAddress);

    c2_1.registerRole(newowner);
    c2_2.registerRole(newowner);


    await c2_1.seal(true);
    await c2_2.seal(true);
    assert(await c2_1.check());
    assert(!await c2_2.check());


    let c3_1 = c2_1.createRevision([k2]);
    let c3_2 = c2_1.createRevision([k]);


    c3_1.registerRole(newowner2);
    c3_2.registerRole(newowner2);



    await c3_1.seal(true);
    await c3_2.seal(true);


    assert(await c3_1.check());
    assert(!await c3_2.check());


});