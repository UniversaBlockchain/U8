/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// this is just a test file tu run with u8

let io = require("io");
let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let TransactionPack = require("transactionpack").TransactionPack;
let ExtendedSignature = require("extendedsignature").ExtendedSignature;
let roles = require("roles");
let t = require("tools");

async function testReadLines() {
    let input = await io.openRead("../test/test.txt");
    let n = 1;
    for await (let b of input.lines) {
        console.log(`${n++} [${b}]`);
    }
}

const Boss = require('boss.js');

async function testBoss() {

    //UNCOMMENT TO MAKE BOSS WORK
    //delete Object.prototype.equals;

    let src = {hello: 'world', data: [1, 2, 3]};
    let packed = await Boss.dump(src);
    assert(JSON.stringify(await Boss.load(packed)) == JSON.stringify(src));
    let reader = new Boss.Reader(packed);
    console.log(JSON.stringify(reader.read()));
    console.log(JSON.stringify(reader.read()));
    let writer = new Boss.Writer();
    writer.write(src);
    assert(packed.toString() == writer.get().toString());
}

import {expect, unit} from 'test'

function logContractTree(contract,prefix) {
    if(!prefix)
        prefix = "";

    console.log(prefix+" "+contract.id.base64);
    let i = 0;
    for(let ri of contract.revokingItems) {
        logContractTree(ri,prefix+".revoke["+i+"]");
        i++;
    }

    i = 0;
    for(let ri of contract.newItems) {
        logContractTree(ri,prefix+".new["+i+"]");
        i++;
    }
}

async function testContract() {
    let input = await io.openRead("../test/ttt.unicon");
    let sealed = await input.allBytes();

    let contract = await TransactionPack.unpack(sealed).contract;
    logContractTree(contract,"root");
    await contract.check();
    console.log(JSON.stringify(contract.errors));
    assert(contract.errors.length === 5);


    let privateBytes = await (await io.openRead("../test/pregenerated_key.private.unikey")).allBytes();
    let privateKey = new crypto.PrivateKey(privateBytes);
    let es = await ExtendedSignature.verify(privateKey.publicKey, await ExtendedSignature.sign(privateKey,sealed),sealed);
    assert(es !== null);

    let c = Contract.fromPrivateKey(privateKey);
    await c.seal();
    c.transactionPack = new TransactionPack(c);
    let tp = await c.transactionPack.pack();

    let c2 = await TransactionPack.unpack(tp).contract;
    await c2.check();
    console.log(JSON.stringify(c2.errors));
    assert(c2.errors.length === 0);

    assert(t.valuesEqual(c,c2));
}

async function testContract2() {
    let input = await io.openRead("../test/sc.unicon");
    let sealed = await input.allBytes();

    let contract = await TransactionPack.unpack(sealed).contract;
    logContractTree(contract, "root");
    await contract.check();
    console.log(JSON.stringify(contract.errors));
    assert(contract.errors.length === 0);
}

async function testES() {
    let bytes = await (await io.openRead("../test/bytes.bin")).allBytes();
    let signature = await (await io.openRead("../test/signature.bin")).allBytes();
    console.log(bytes.length);
    console.log(signature.length);

    let key = await ExtendedSignature.extractPublicKey(signature);
    console.log(key);

    let es = await ExtendedSignature.verify(key, signature, bytes);
    assert(es != null);
}

// require('unit_tests/boss_test')
// require('unit_tests/crypto_test')
// require('unit_tests/network_test');
// require('unit_tests/file_tests');
// require('unit_tests/contract_test')
// require('unit_tests/deltas_test')
// require('unit_tests/role_test')
// require('unit_tests/simplerole_test')
// require('unit_tests/listrole_test')
// require('unit_tests/linkrole_test')
// require('unit_tests/changenumberpermission_test')
// require('unit_tests/changeownerpermission_test')
// require('unit_tests/modifydatapermission_test')
// require('unit_tests/revokepermission_test')
// require('unit_tests/splitjoinpermission_test')
// require('unit_tests/constraint_test')
// require('unit_tests/pg_test')
// require('unit_tests/ledger_test')
// require('unit_tests/itemcache_test')
// require('unit_tests/udp_test')
// require('unit_tests/collection_test')
// require('unit_tests/services/environment_test')
// require('unit_tests/services/slot_test')
// require('unit_tests/services/follower_test')
// require('unit_tests/services/uns_test')
// require('unit_tests/web_test')
// require('unit_tests/parcel_test')
// require('unit_tests/asyncevent_test')
// require('unit_tests/contractsservice_test')
// require('unit_tests/notification_test')
// require('unit_tests/lock_test')
// require('unit_tests/main_test')
require('unit_tests/worker_tests');
// require('unit_tests/stress_test')

async function main() {
    //testBoss();

    // testBoss();
    // await testES();
    //await testContract();
    // await testContract2();
    // let xx = [];//1,2,3,4,5];
    // console.log(xx.reduce((a,b) => a + b, 0));
    // await sleep(100);
    // gc();

    // console.log(btoa(Uint8Array.of(1,2,3)));
    // console.log(atob('AQID'));

    // await sleep(100);
    // console.log("hello async");
    await unit.perform();
}