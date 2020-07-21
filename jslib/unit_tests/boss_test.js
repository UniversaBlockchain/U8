/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
const BossBiMapper = require("bossbimapper").BossBiMapper;
import * as tk from 'unit_tests/test_keys'

unit.test("boss_test: asyncLoad array of HashId", async () => {
    let arr0 = [];
    for (let i = 0; i < 100; ++i)
        arr0.push(await crypto.HashId.of(t.randomString(64)));
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut(" dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].__proto__ === crypto.HashId.prototype);
        assertSilent(arr[i].constructor.name === "HashIdImpl");
        assertSilent(arr[i].base64 === arr0[i].base64);
    }
});

unit.test("boss_test: asyncLoad nested array of HashId", async () => {
    let hashId = await crypto.HashId.of(t.randomString(64));
    let arr0 = {a:[{b:[{c:hashId, i:223334444, f:7654321.1234567, b0: false, b1: true, n: null}]}]};
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    assertSilent(arr.a[0].b[0].c.__proto__ === crypto.HashId.prototype);
    assertSilent(arr.a[0].b[0].c.constructor.name === "HashIdImpl");
    assertSilent(arr.a[0].b[0].c.base64 === hashId.base64);
    assertSilent(typeof arr.a[0].b[0].i === "number");
    assertSilent(arr.a[0].b[0].i === 223334444);
    assertSilent(typeof arr.a[0].b[0].f === "number");
    assertSilent(arr.a[0].b[0].f === 7654321.1234567);
    assertSilent(typeof arr.a[0].b[0].b0 === "boolean");
    assertSilent(arr.a[0].b[0].b0 === false);
    assertSilent(typeof arr.a[0].b[0].b1 === "boolean");
    assertSilent(arr.a[0].b[0].b1 === true);
    assertSilent(typeof arr.a[0].b[0].n === "object");
    assertSilent(arr.a[0].b[0].n === null);
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
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
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
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].constructor.name === "PublicKeyImpl");
        assertSilent(arr[i].__proto__ === crypto.PublicKey.prototype);
        assertSilent(btoa(arr[i].fingerprints) === btoa(arr0[i].fingerprints));
    }
});

unit.test("boss_test: asyncLoad array of PrivateKeys", async () => {
    let arr0 = [];
    for (let i = 0; i < 10; ++i)
        arr0.push(new Promise(async resolve => resolve((await crypto.PrivateKey.generate(2048)))));
    arr0 = await Promise.all(arr0);
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
    let dt = new Date().getTime() - t0;
    console.logPut("dt = " + dt + " ");
    for (let i = 0; i < arr.length; ++i) {
        assertSilent(arr[i].constructor.name === "PrivateKeyImpl");
        assertSilent(arr[i].__proto__ === crypto.PrivateKey.prototype);
        assertSilent(btoa(arr[i].publicKey.fingerprints) === btoa(arr0[i].publicKey.fingerprints));
    }
});

unit.test("boss_test: asyncLoad array of Date", async () => {
    let arr0 = [];
    for (let i = 0; i < 100; ++i) {
        arr0.push(new Date(new Date().getTime() + i*1000 + Math.floor(Math.random()*1000)));
    }
    let bin = await Boss.asyncDump(await BossBiMapper.getInstance().serialize(arr0));
    let t0 = new Date().getTime();
    let arr = await BossBiMapper.getInstance().deserialize(await Boss.asyncLoad(bin));
    //let arr = await BossBiMapper.getInstance().deserialize(await Boss.load(bin));
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
    let ser = await BossBiMapper.getInstance().serialize(arr0);
    let t0 = new Date().getTime();
    let bin = await Boss.asyncDump(ser);
    //let bin = await Boss.dump(ser);
    let dt = new Date().getTime() - t0;
    console.logPut(" bin.length: " + bin.length + "  ");
    console.logPut("dt = " + dt + " ");
});
