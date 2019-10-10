/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import  * as tp from 'transactionpack'
import * as t from 'tools'
import * as tk from 'unit_tests/test_keys'

const Constraint = require('constraint').Constraint;

unit.test("change number permission serialization", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);
    let cnp = new perm.ChangeNumberPermission(role,{field_name:"field1",min_step: -1, max_step: 2, min_value:500, max_value: 1000});
    let cnp2 = await dbm.DefaultBiMapper.getInstance().deserialize(await dbm.DefaultBiMapper.getInstance().serialize(cnp));
    let cnp3 = new perm.ChangeNumberPermission(role,{field_name:"field1",min_step: 1, max_step: 2, min_value:500, max_value: 1000});
    assert(t.valuesEqual(cnp,cnp2));
    assert(!t.valuesEqual(cnp,cnp3));


});

unit.test("change number permission step", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let c = cnt.Contract.fromPrivateKey(k);
    c.registerRole(role);
    c.state.data.field1 = 987;

    let cnp = new perm.ChangeNumberPermission(role,{field_name:"field1",min_step: -1, max_step: 2, min_value:500, max_value: 1000});
    c.definition.addPermission(cnp);
    await c.seal();
    c.transactionPack = new tp.TransactionPack(c);


    let c1 = await c.createRevision([k]);
    c1.state.data.field1 = 986;
    await c1.seal();
    c1.transactionPack = new tp.TransactionPack(c1);
    assert(await c1.check());

    let c2 = await c.createRevision([k]);
    c2.state.data.field1 = 985;
    await c2.seal();
    c2.transactionPack = new tp.TransactionPack(c2);
    assert(!await c2.check());

    let c3 = await c.createRevision([k]);
    c3.state.data.field1 = 989;
    await c3.seal();
    c3.transactionPack = new tp.TransactionPack(c3);
    assert(await c3.check());

    let c4 = await c.createRevision([k]);
    c4.state.data.field1 = 990;
    await c4.seal();
    c4.transactionPack = new tp.TransactionPack(c4);
    assert(!await c4.check());

});


unit.test("change number permission value", async () => {
    let k = tk.TestKeys.getKey();
    let role = new roles.SimpleRole("name",k.publicKey);
    role.keyAddresses.add(k.publicKey.shortAddress);

    let c = cnt.Contract.fromPrivateKey(k);
    c.registerRole(role);
    c.state.data.field1 = 987;

    let cnp = new perm.ChangeNumberPermission(role,{field_name:"field1",min_step: -10000, max_step: 10000, min_value:500, max_value: 1000});
    c.definition.addPermission(cnp);
    await c.seal();
    c.transactionPack = new tp.TransactionPack(c);

    {
        let c1 = await c.createRevision([k]);
        c1.state.data.field1 = 500;
        await c1.seal();
        c1.transactionPack = new tp.TransactionPack(c1);
        assert(await c1.check());
    }

    {
        let c1 = await c.createRevision([k]);
        c1.state.data.field1 = 550;
        await c1.seal();
        c1.transactionPack = new tp.TransactionPack(c1);
        assert(await c1.check());
    }

    {
        let c2 = await c.createRevision([k]);
        c2.state.data.field1 = 499;
        await c2.seal();
        c2.transactionPack = new tp.TransactionPack(c2);
        assert(!await c2.check());
    }

    {
        let c2 = await c.createRevision([k]);
        c2.state.data.field1 = 242;
        await c2.seal();
        c2.transactionPack = new tp.TransactionPack(c2);
        assert(!await c2.check());
    }

    {
        let c3 = await c.createRevision([k]);
        c3.state.data.field1 = 1000;
        await c3.seal();
        c3.transactionPack = new tp.TransactionPack(c3);
        assert(await c3.check());
    }

    {
        let c3 = await c.createRevision([k]);
        c3.state.data.field1 = 953;
        await c3.seal();
        c3.transactionPack = new tp.TransactionPack(c3);
        assert(await c3.check());
    }

    {
        let c4 = await c.createRevision([k]);
        c4.state.data.field1 = 1001;
        await c4.seal();
        c4.transactionPack = new tp.TransactionPack(c4);
        assert(!await c4.check());
    }

    {
        let c4 = await c.createRevision([k]);
        c4.state.data.field1 = 2223;
        await c4.seal();
        c4.transactionPack = new tp.TransactionPack(c4);
        assert(!await c4.check());
    }

});

unit.test("change number permission contractRefToPermission", async () => {
    let k = tk.TestKeys.getKey();
    let contract = cnt.Contract.fromPrivateKey(k);
    let contract2 = cnt.Contract.fromPrivateKey(k);

    let role = new roles.RoleLink("custom","owner");
    role.contract = contract;
    //c.registerRole(role);

    let changeNumberPermission = new perm.ChangeNumberPermission(role, {field_name: "field1", min_value:33, max_value: 34, min_step: 1, max_step: 1 });

    let role2 = new roles.RoleLink("custom","owner");
    role2.contract = contract2;
    //c.registerRole(role2);

    let changeNumberPermission2 = new perm.ChangeNumberPermission(role2, {field_name: "field1", min_value:33, max_value: 34, min_step: 1, max_step: 1 });

    changeNumberPermission.id = "changenumber";
    changeNumberPermission2.id = "changenumber2";

    contract.definition.addPermission(changeNumberPermission);
    contract2.definition.addPermission(changeNumberPermission2);

    await contract.seal();

    let constr = new Constraint(contract2);
    constr.name = "test1";

    let conditions = {all_of : [
        "ref.id==\""+contract.id.base64+"\"",
        "this.definition.permissions.changenumber2==ref.definition.permissions.changenumber"
            ]};

    constr.setConditions(conditions);
    contract2.addConstraint(constr);

    await contract2.seal(true);

    await contract2.transactionPack.referencedItems.set(contract2.id, contract);
    contract2 = await Contract.fromPackedTransaction(await contract2.getPackedTransaction());
    //assert(await contract2.check());
});
