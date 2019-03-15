import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import  * as tp from 'transactionpack'
import * as t from 'tools'
import * as tk from 'unit_tests/test_keys'


unit.test("modify data permission serialization", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let mdp = new perm.ModifyDataPermission(role,{fields:{f1:null,f2:["123","asd123"]}});
    let mdp2 = dbm.DefaultBiMapper.getInstance().deserialize(dbm.DefaultBiMapper.getInstance().serialize(mdp));
    let mdp3 = new perm.ModifyDataPermission(role,{fields:{f1:null,f2:["13","asd123"]}});
    assert(t.valuesEqual(mdp,mdp2));
    assert(!t.valuesEqual(mdp,mdp3));

});


unit.test("modify data permission check whitelist", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("r123",k.publicKey.shortAddress);

    let mdp = new perm.ModifyDataPermission(role,{fields:{f1:null,f2:["123","asd123"]}});
    mdp.id = "3ylTgi";
    let c1 = cnt.Contract.fromPrivateKey(k);
    c1.registerRole(role);
    c1.state.data.f1 = "Hello";
    c1.definition.addPermission(mdp);
    await c1.seal(true);
    assert(await c1.check());



    let c2_1 = c1.createRevision([k]);
    let c2_2 = c1.createRevision([k2]);


    c2_1.state.data.f1 = "Bye";
    c2_2.state.data.f1 = "Bye";



    await c2_1.seal(true);
    await c2_2.seal(true);

    assert(await c2_1.check());
    assert(!await c2_2.check());

});


unit.test("modify data permission check listed", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("r123",k.publicKey.shortAddress);

    let mdp = new perm.ModifyDataPermission(role,{fields:{f1:null,f2:["123","asd123"]}});
    mdp.id = "3ylTgi";
    let c1 = cnt.Contract.fromPrivateKey(k);
    c1.registerRole(role);
    c1.state.data.f2 = "Hello";
    c1.definition.addPermission(mdp);
    await c1.seal(true);
    assert(await c1.check());



    let c2_1 = c1.createRevision([k]);
    let c2_2 = c1.createRevision([k]);
    let c2_3 = c1.createRevision([k]);


    c2_1.state.data.f2 = "123";
    c2_2.state.data.f2 = 123;
    c2_3.state.data.f2 = {a:123};



    await c2_1.seal(true);
    await c2_2.seal(true);
    await c2_3.seal(true);

    assert(await c2_1.check());
    assert(!await c2_2.check());
    assert(!await c2_3.check());

});