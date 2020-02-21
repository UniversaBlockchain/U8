/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'

import  * as roles from 'roles'
import  * as perm from 'permissions'
import  * as cnt from 'contract'
import * as tk from 'unit_tests/test_keys'


unit.test("change role permission allowed", async () => {
    let k = tk.TestKeys.getKey();
    let contract = cnt.Contract.fromPrivateKey(k);
    contract.registerRole(new roles.RoleLink("custom_role", "owner", contract));
    contract.definition.addPermission(new perm.ChangeRolePermission(new roles.RoleLink("@owner", "owner", contract), {role_name: "custom_role"}));
    await contract.seal(true);

    contract = await contract.createRevision([k]);
    contract.registerRole(new roles.RoleLink("custom_role", "issuer", contract));
    await contract.seal(true);

    assert(await contract.check());
});

unit.test("change role permission declined", async () => {
    let k = tk.TestKeys.getKey();
    let contract = cnt.Contract.fromPrivateKey(k);
    contract.registerRole(new roles.RoleLink("custom_role", "owner", contract));
    contract.definition.addPermission(new perm.ChangeRolePermission(new roles.RoleLink("@owner", "owner", contract), {role_name: "custom_role1"}));
    await contract.seal(true);

    contract = await contract.createRevision([k]);
    contract.registerRole(new roles.RoleLink("custom_role", "issuer", contract));
    await contract.seal(true);

    assert(!await contract.check());
});

unit.test("change role permission add allowed", async () => {
    let k = tk.TestKeys.getKey();
    let contract = cnt.Contract.fromPrivateKey(k);
    contract.definition.addPermission(new perm.ChangeRolePermission(new roles.RoleLink("@owner", "owner", contract), {role_name: "custom_role"}));
    contract.state.data.foo = true;
    contract.definition.data.bar = false;
    await contract.seal(true);

    contract = await cnt.Contract.fromPackedTransaction(await contract.getPackedTransaction());
    contract = await contract.createRevision([k]);
    contract.registerRole(new roles.RoleLink("custom_role", "issuer", contract));
    await contract.seal(true);

    assert(await contract.check());
});