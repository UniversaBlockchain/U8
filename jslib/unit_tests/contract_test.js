import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as bbm from 'bossbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import * as t from 'tools'
import * as d from 'deltas'
import * as tk from 'unit_tests/test_keys'

unit.test("contract copy test", async () => {
    let k = tk.TestKeys.getKey();
    let c1 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.SimpleRole("owner",k.publicKey.shortAddress);
    role.keyAddresses.add(k.publicKey.shortAddress);
    c1.registerRole(role);

    let mdp = new perm.RevokePermission(role);
    c1.definition.addPermission(mdp);

    await c1.seal(true);

    let c2 = c1.copy();

    let s1 = bbm.BossBiMapper.getInstance().serialize(c1);
    let s2 = bbm.BossBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(s1,s2));
    assert(d.Delta.between(null,s1,s2) == null);

    let ds1 = dbm.DefaultBiMapper.getInstance().serialize(c1);
    let ds2 = dbm.DefaultBiMapper.getInstance().serialize(c2);

    assert(t.valuesEqual(ds1,ds2));
    assert(d.Delta.between(null,ds1,ds2) == null);
});

