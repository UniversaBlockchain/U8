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

unit.test("boss_test: asyncLoad array of HashId", async () => {
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

unit.test("boss_test: asyncLoad nested array of HashId", async () => {
    let hashId = await crypto.HashId.of(t.randomString(64));
    let arr0 = {a:[{b:[{c:hashId}]}]};
    let bin = Boss.dump(BossBiMapper.getInstance().serialize(arr0));
    let arr = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    assertSilent(arr.a[0].b[0].c.__proto__ === crypto.HashId.prototype);
    assertSilent(arr.a[0].b[0].c.constructor.name === "HashIdImpl");
    assertSilent(arr.a[0].b[0].c.base64 === hashId.base64);
});

unit.test("boss_test: asyncLoad array of KeyAddress", async () => {
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

unit.test("boss_test: asyncLoad array of PublicKeys", async () => {
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

unit.test("boss_test: asyncLoad array of Date", async () => {
    let arr0 = [];
    for (let i = 0; i < 100; ++i) {
        arr0.push(new Date(new Date().getTime() + i*1000 + Math.floor(Math.random()*1000)));
    }
    let bin = Boss.dump(BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = BossBiMapper.getInstance().deserialize(Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].constructor.name === "Date");
        assertSilent(arr[i].__proto__ === Date.prototype);
        assertSilent(arr[i].toString() === arr0[i].toString());
        assertSilent(arr[i].getTime() === Math.floor(arr0[i].getTime()/1000)*1000);
    }
});

unit.test("boss_test: asyncDump array of HashId", async () => {
    let arr0 = [];
    for (let i = 0; i < 100; ++i)
        arr0.push(await crypto.HashId.of(t.randomString(64)));
    let ser = BossBiMapper.getInstance().serialize(arr0);
    ser = ["dfd", "333444455555", "qwerty123456"];
    let t0 = new Date().getTime();
    let bin = await Boss.asyncDump(ser);
    //let bin = Boss.dump(ser);
    let dt = new Date().getTime() - t0;
    console.log("bin.length: " + bin.length);
    console.log("load: " + Boss.load(bin));
    console.logPut("dt = " + dt + " ");
});

// unit.test("boss_test: bench escrow", async () => {
//     //let bin = await io.fileGetContentsAsBytes("/tmp/escrow.tx.unicon");
//     //let bin = await io.fileGetContentsAsBytes("/tmp/loan.tx.unicon");
//     let bin = await io.fileGetContentsAsBytes("/tmp/bossTestPackedTransaction");
//     console.log("bin size: " + bin.length);
//     let t0 = new Date().getTime();
//     //for (let i = 0; i < 1; ++i) {
//     let nestedLoadMap = {referencedItems:{data:null}, subItems:{data:null}, contract:{data:null}};
//     //let tp = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin, nestedLoadMap));
//     let tp = await Boss.asyncLoad(bin, nestedLoadMap);
//     //let tp = await Boss.asyncLoad(bin);
//     //let tp = await BossBiMapper.getInstance().deserialize(Boss.load(bin));
//     //}
//     let dt = new Date().getTime() - t0;
//     console.log("dt = " + dt);
// });
