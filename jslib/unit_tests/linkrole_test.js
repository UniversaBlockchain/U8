import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import * as t from 'tools'
import * as cnt from 'contract'
import * as tk from 'unit_tests/test_keys'



unit.test("link role serialization", async () => {
    let role = new roles.RoleLink("name1","name2");
    role.requiredAnyConstraints.add("ref1");

    let s = await role.serialize(dbm.DefaultBiMapper.getInstance());

    let role2 = new roles.RoleLink();
    await role2.deserialize(s, dbm.DefaultBiMapper.getInstance());
    assert(t.valuesEqual(role,role2))
});


unit.test("link role 1", async () => {
    let k1 = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let c = cnt.Contract.fromPrivateKey(k1);
    let  rl = new roles.RoleLink("owner","issuer");
    c.registerRole(rl);


    assert(rl.isAllowedForKeys([k1.publicKey]));
    assert(!rl.isAllowedForKeys([k2.publicKey]));
});

unit.test("link role many", async () => {
    let k1 = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let c = cnt.Contract.fromPrivateKey(k1);
    let  rl = new roles.RoleLink("owner","issuer");
    c.registerRole(rl);

    rl = new roles.RoleLink("custom","owner");
    c.registerRole(rl);

    assert(rl.isAllowedForKeys([k1.publicKey]));
    assert(!rl.isAllowedForKeys([k2.publicKey]));

});
