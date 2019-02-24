import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import * as t from 'tools'

unit.test("role refs", () => {
    let role = new roles.Role("name");

    assert(role.isAllowedForKeys([]));

    role.requiredAnyConstraints.add("ref1");

    assert(!role.isAllowedForKeys([]));

    assert(role.isAllowedForConstraints(new Set(["ref1"])));

    role.requiredAllConstraints.add("ref2");
    role.requiredAllConstraints.add("ref3");

    assert(!role.isAllowedForConstraints(new Set(["ref1","ref2"])));
    assert(role.isAllowedForConstraints(new Set(["ref1","ref2","ref3"])));
});


unit.test("role serialization", () => {
    let role = new roles.Role("name");

    role.requiredAnyConstraints.add("ref1");

    role.requiredAllConstraints.add("ref2");
    role.requiredAllConstraints.add("ref3");


    let s = role.serialize(dbm.DefaultBiMapper.getInstance());

    let role2 = new roles.Role();
    role2.deserialize(s,dbm.DefaultBiMapper.getInstance());
    assert(t.valuesEqual(role,role2))
});