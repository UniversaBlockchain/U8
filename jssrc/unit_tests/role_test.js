/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'

import  * as dbm from 'defaultbimapper'
import  * as roles from 'roles'
import * as t from 'tools'
const BossBiMapper = require("bossbimapper").BossBiMapper;

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


unit.test("role serialization", async () => {
    let role = new roles.Role("name");

    role.requiredAnyConstraints.add("ref1");

    role.requiredAllConstraints.add("ref2");
    role.requiredAllConstraints.add("ref3");


    let s = await role.serialize(dbm.DefaultBiMapper.getInstance());

    let role2 = new roles.Role();
    await role2.deserialize(s, dbm.DefaultBiMapper.getInstance());
    assert(t.valuesEqual(role,role2))
});

unit.test("role boss_test", async () => {
    let bin = atob("LyNtb2RlG0FMTCtyb2xlcx4vS2FkZHJlc3Nlcw4XM19fdHlwZVNLZXlBZGRyZXNzQ3VhZGRyZXNzvCUQsXaZqpBDI3SuGBgebTR66dRKYPpSkInEp7jHCEtCInmrXhB+I2tleXMGVVNTaW1wbGVSb2xlI25hbWUTcjI7YW5vbklkc30vPRYXVV1lvCUQz7FDcou+Z6evO9X1uvKOaArPdCEczcePfWYFMYHMAYdf/5kKF1VdZbwlEGZQocH3UGgDQ/ZLXiUpUzJ0UfhyZxcC4NazcjhNoM1zo22hWnV9VYWNE3IznX0vPQ4XVV1lvDUQe8EJz220Si5SPqgBAS0DtyXN3sNAbO3hQ3X8GH/fXeN/2h3ZEs3anQ8rlIpIIPx53OJ3V3V9VYWNE3IxnX1VQ0xpc3RSb2xljRNsclNxdW9ydW1TaXplAA==");
    //let role = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
    let role = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let role = await Boss.load(bin);
    //let role = await Boss.asyncLoad(bin);
    //console.log(JSON.stringify(role, null, 2));
    console.log("role.constructor.name: " + role.constructor.name);
    console.log("role.name: " + role.name);
    for (let key in role.roles) {
        let r = role.roles[key];
        if (r.constructor.name !== "Function") {
            console.log("  r.constructor.name: " + r.constructor.name);
            console.log("  r.name: " + r.name);
            console.log("  r.keyAddresses.length: " + r.keyAddresses.size);
            r.keyAddresses.forEach(ka => {
                console.log("    keyAddress.constructor.name: " + ka.constructor.name);
                console.log("    keyAddress: " + ka);
            });
        }
    }
});
