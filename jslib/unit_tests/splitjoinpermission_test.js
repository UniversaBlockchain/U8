import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import  * as tp from 'transactionpack'
import * as t from 'tools'
import * as tk from 'unit_tests/test_keys'



unit.test("split join permission serialization", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let role2 = new roles.SimpleRole("name",k.publicKey.longAddress);

    let sjp = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["state.origin","definition.data.key1"]});
    let sjp2 = await dbm.DefaultBiMapper.getInstance().deserialize(await dbm.DefaultBiMapper.getInstance().serialize(sjp));
    let sjp3 = new perm.RevokePermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["state.origin","definition.data.key2"]});
    assert(t.valuesEqual(sjp,sjp2));
    assert(!t.valuesEqual(sjp,sjp3));
    
});


unit.test("split join permission split", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    let sjp = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});

    let c = cnt.Contract.fromPrivateKey(k2);
    c.state.data.amount = "1000";
    c.definition.data.key1 = "val1";
    c.definition.addPermission(sjp);

    await c.seal(true);

    let c2_1 = await c.createRevision([k]);
    let c2_2 = await c.createRevision([k2]);
    let c2_3 = await c.createRevision([k]);

    (await c2_1.split(1))[0].state.data.amount = "500";
    (await c2_2.split(1))[0].state.data.amount = "500";
    (await c2_3.split(1))[0].state.data.amount = "600";

    c2_1.state.data.amount = "500";
    c2_2.state.data.amount = "500";
    c2_3.state.data.amount = "500";

    await c2_1.seal(true);
    await c2_2.seal(true);
    await c2_3.seal(true);

    assert(await c2_1.check());
    assert(!await c2_2.check());
    assert(!await c2_3.check());
});

unit.test("split join permission split no permission", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();

    let c = cnt.Contract.fromPrivateKey(k2);
    c.state.data.amount = "1000";
    c.definition.data.key1 = "val1";

    await c.seal(true);

    let c2_1 = await c.createRevision([k]);

    (await c2_1.split(1))[0].state.data.amount = "500";

    c2_1.state.data.amount = "500";

    await c2_1.seal(true);

    assert(!await c2_1.check());
});


unit.test("split join permission join", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    let sjp1 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});
    let sjp2 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});

    let c1 = cnt.Contract.fromPrivateKey(k2);
    c1.state.data.amount = "1000";
    c1.definition.data.key1 = "val1";
    c1.definition.addPermission(sjp1);

    await c1.seal(true);

    let c2 = cnt.Contract.fromPrivateKey(k2);
    c2.state.data.amount = "1000";
    c2.definition.data.key1 = "val1";
    c2.definition.addPermission(sjp2);

    await c2.seal(true);

    let c_1 = await c1.createRevision([k]);
    let c_2 = await c1.createRevision([k2]);
    let c_3 = await c1.createRevision([k]);

    c_1.revokingItems.add(c2);
    c_2.revokingItems.add(c2);
    c_3.revokingItems.add(c2);

    c_1.state.data.amount = "2000";
    c_2.state.data.amount = "2000";
    c_3.state.data.amount = "2100";

    await c_1.seal(true);
    await c_2.seal(true);
    await c_3.seal(true);

    assert(await c_1.check());
    assert(!await c_2.check());
    assert(!await c_3.check());
});

unit.test("split join permission join no permission", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    let sjp1 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});

    let c1 = cnt.Contract.fromPrivateKey(k2);
    c1.state.data.amount = "1000";
    c1.definition.data.key1 = "val1";
    c1.definition.addPermission(sjp1);

    await c1.seal(true);

    let c2 = cnt.Contract.fromPrivateKey(k2);
    c2.state.data.amount = "1000";
    c2.definition.data.key1 = "val1";

    await c2.seal(true);

    let c_1 = await c1.createRevision([k]);

    c_1.revokingItems.add(c2);

    c_1.state.data.amount = "2000";

    await c_1.seal(true);

    assert(!await c_1.check());
});


unit.test("split join permission join no matching", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    let sjp1 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});

    let c1 = cnt.Contract.fromPrivateKey(k2);
    c1.state.data.amount = "1000";
    c1.definition.data.key1 = "val1";
    c1.definition.addPermission(sjp1);

    await c1.seal(true);

    //field doesn't match
    let c2 = cnt.Contract.fromPrivateKey(k2);
    c2.state.data.amount = "1000";
    c2.definition.data.key1 = "val2";
    let sjp2 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});
    c2.definition.addPermission(sjp2);
    await c2.seal(true);


    //no field
    let c3 = cnt.Contract.fromPrivateKey(k2);
    c3.state.data.amount = "1000";
    let sjp3 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});
    c3.definition.addPermission(sjp3);
    await c3.seal(true);

    //different permission
    let c4 = cnt.Contract.fromPrivateKey(k2);
    c4.state.data.amount = "1000";
    c4.definition.data.key1 = "val1";
    let sjp4 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key2"]});
    c4.definition.addPermission(sjp4);
    await c4.seal(true);


    let c_1 = await c1.createRevision([k]);
    let c_2 = await c1.createRevision([k]);
    let c_3 = await c1.createRevision([k]);

    c_1.revokingItems.add(c2);
    c_1.state.data.amount = "2000";
    await c_1.seal(true);
    assert(!await c_1.check());

    c_2.revokingItems.add(c3);
    c_2.state.data.amount = "2000";
    await c_2.seal(true);
    assert(!await c_2.check());

    c_3.revokingItems.add(c4);
    c_3.state.data.amount = "2000";
    await c_3.seal(true);
    assert(!await c_3.check());

});


unit.test("split join permission split/join", async () => {
    let k = tk.TestKeys.getKey();
    let k2 = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey.shortAddress);
    let role2 = new roles.SimpleRole("name",k2.publicKey.shortAddress);
    let sjp1 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});
    let sjp2 = new perm.SplitJoinPermission(role2,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});
    let sjp3 = new perm.SplitJoinPermission(role,{field_name:"amount",min_value:"0.0001",min_unit: "0.0001",join_match_fields: ["definition.data.key1"]});

    let c1 = cnt.Contract.fromPrivateKey(k2);
    c1.state.data.amount = "1000";
    c1.definition.data.key1 = "val1";
    c1.definition.addPermission(sjp1);

    await c1.seal(true);

    let c2 = cnt.Contract.fromPrivateKey(k2);
    c2.state.data.amount = "1000";
    c2.definition.data.key1 = "val1";
    c2.definition.addPermission(sjp2);

    await c2.seal(true);

    let c3 = cnt.Contract.fromPrivateKey(k2);
    c3.state.data.amount = "1000";
    c3.definition.data.key1 = "val1";
    c3.definition.addPermission(sjp3);

    await c3.seal(true);




    let c_1 = await c1.createRevision([k]);
    let c_2 = await c1.createRevision([k2]);
    let c_3 = await c1.createRevision([k,k2]);

    c_1.revokingItems.add(c2);
    c_1.revokingItems.add(c3);
    (await c_1.split(1))[0].state.data.amount = "500";
    c_1.state.data.amount = "2500";
    await c_1.seal(true);
    assert(!await c_1.check());


    c_2.revokingItems.add(c2);
    c_2.revokingItems.add(c3);
    (await c_2.split(1))[0].state.data.amount = "500";
    c_2.state.data.amount = "2500";
    await c_2.seal(true);
    assert(!await c_2.check());

    c_3.revokingItems.add(c2);
    c_3.revokingItems.add(c3);
    (await c_3.split(1))[0].state.data.amount = "500";
    c_3.state.data.amount = "2500";
    await c_3.seal(true);
    assert(await c_3.check());

});