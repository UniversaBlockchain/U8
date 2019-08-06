import {expect, unit, assert, assertSilent} from 'test'
const BossBiMapper = require("bossbimapper").BossBiMapper;
import * as tk from 'unit_tests/test_keys'

unit.test("boss_test: hello", async () => {
    let bin = atob("LyNtb2RlG0FMTCtyb2xlcx4vS2FkZHJlc3Nlcw4XM19fdHlwZVNLZXlBZGRyZXNzQ3VhZGRyZXNzvCUQsXaZqpBDI3SuGBgebTR66dRKYPpSkInEp7jHCEtCInmrXhB+I2tleXMGVVNTaW1wbGVSb2xlI25hbWUTcjI7YW5vbklkc30vPRYXVV1lvCUQz7FDcou+Z6evO9X1uvKOaArPdCEczcePfWYFMYHMAYdf/5kKF1VdZbwlEGZQocH3UGgDQ/ZLXiUpUzJ0UfhyZxcC4NazcjhNoM1zo22hWnV9VYWNE3IznX0vPQ4XVV1lvDUQe8EJz220Si5SPqgBAS0DtyXN3sNAbO3hQ3X8GH/fXeN/2h3ZEs3anQ8rlIpIIPx53OJ3V3V9VYWNE3IxnX1VQ0xpc3RSb2xljRNsclNxdW9ydW1TaXplAA==");
    //let role = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let role = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let role = Boss.load(bin);
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

unit.test("boss_test: array of HashId", async () => {
    let arr0 = [];
    for (let i = 0; i < 100; ++i)
        arr0.push(await crypto.HashId.of(t.randomString(64)));
    let bin = Boss.dump(BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].__proto__ === crypto.HashId.prototype);
        assertSilent(arr[i].constructor.name === "HashIdImpl");
        assertSilent(arr[i].base64 === arr0[i].base64);
    }
});

unit.test("boss_test: array of KeyAddress", async () => {
    let arrPk = [];
    let arr0 = [];
    for (let i = 0; i < 10; ++i)
        arr0.push(new Promise(async resolve => {
            let pk = await crypto.PrivateKey.generate(2048);
            arrPk[i] = pk.publicKey;
            resolve((i % 2 === 0) ? pk.shortAddress : pk.longAddress);
        }));
    arr0 = await Promise.all(arr0);
    let bin = Boss.dump(BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].constructor.name === "KeyAddress");
        assertSilent(arr[i].__proto__ === crypto.KeyAddress.prototype);
        assertSilent(arr[i].match(arrPk[i]));
        assertSilent(arr[i].toString() === arr0[i].toString());
    }
});

unit.test("boss_test: array of PublicKeys", async () => {
    let arr0 = [];
    for (let i = 0; i < 10; ++i)
        arr0.push(new Promise(async resolve => resolve((await crypto.PrivateKey.generate(2048)).publicKey)));
    arr0 = await Promise.all(arr0);
    let bin = Boss.dump(BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].constructor.name === "PublicKeyImpl");
        assertSilent(arr[i].__proto__ === crypto.PublicKey.prototype);
        assertSilent(btoa(arr[i].fingerprints) === btoa(arr0[i].fingerprints));
    }
});
