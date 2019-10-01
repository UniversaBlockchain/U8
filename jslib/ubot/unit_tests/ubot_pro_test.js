/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, unit} from 'test'
import * as tk from "unit_tests/test_keys";

const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotClient = require('ubot/ubot_client').UBotClient;
const cs = require("contractsservice");
const Constraint = require('constraint').Constraint;

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const CONFIG_ROOT = "../test/config/ubot_config";
const ubotsCount = 30;

const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

async function createUbotMain(name, nolog) {
    let args = ["--config", CONFIG_ROOT+"/"+name];
    if (nolog)
        args.push("--nolog");

    return new Promise(async resolve => {
        let ubotMain = new UBotMain(...args);
        await ubotMain.start();
        resolve(ubotMain);
    });
}

async function createUBots(count) {
    //await prepareConfigFiles(count);
    let ubotMains = [];
    for (let i = 0; i < count; ++i)
        ubotMains.push(createUbotMain("ubot"+i, false));
    ubotMains = await Promise.all(ubotMains);
    return ubotMains;
}

async function shutdownUBots(ubots) {
    let promises = [];
    for (let i = 0; i < ubots.length; ++i)
        promises.push(ubots[i].shutdown());
    return Promise.all(promises);
}

async function generateSecureRandomExecutableContract() {
    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        getRandom: {
            pool: {size: 5},
            quorum: {size: 4}
        },
        readRandom: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    executableContract.state.data.js = `
    const BigDecimal  = require("big").Big;
    
    async function getRandom(max) {
        //generate random and write its hash to multi storage
        let rnd = Math.random();
        let hash = crypto.HashId.of(rnd.toString()).base64;
        
        await writeMultiStorage({hash : hash});
        
        //calculate hash of hashes and write it to single storage
        let records = await getMultiStorage();
        let hashes = [];
        for (let r of records)
            hashes.push(r.hash);

        hashes.sort();
        let hashesHash = crypto.HashId.of(hashes.join()).base64;
        await writeSingleStorage({hashesHash : hashesHash});
        
        //add actual random to multi storage
        await writeMultiStorage({hash : hash, rnd : rnd});

        //verify hashesOfHash and rnd -> hash
        records = await getMultiStorage();
        hashes = [];
        let rands = [];
        for (let r of records) {
            if (r.hash !== crypto.HashId.of(r.rnd.toString()).base64)
                throw new Error("Hash does not match the random value");
        
            hashes.push(r.hash);
            rands.push(r.rnd.toString());
        }
        hashes.sort();
        rands.sort();
        hashesHash = crypto.HashId.of(hashes.join()).base64;

        let singleStorage = await getSingleStorage();
        if (hashesHash !== singleStorage.hashesHash)
            throw new Error("Hash of hashes does not match the previously saved: " + hashesHash + "!==" + singleStorage.hashesHash);

        let randomHash = crypto.HashId.of(rands.join());
        let bigRandom = new BigDecimal(0);
        randomHash.digest.forEach(byte => bigRandom = bigRandom.mul(256).add(byte));
        
        let result = Number.parseInt(bigRandom.mod(max).toFixed());

        await writeSingleStorage({hashesHash: hashesHash, result: result});

        return result;
    }
    
    async function readRandom() {
        return (await getSingleStorage()).result;
    }
    `;

    await executableContract.seal();

    return executableContract;
}

async function generateSecureRandomRequestContract(executableContract) {
    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "getRandom";
    requestContract.state.data.method_args = [1000];
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    return requestContract;
}

// unit.test("ubot_pro_test: simple", async () => {
//     for (let i = 0; i < 50; i++) {
//         let ubotMains = await createUBots(ubotsCount);
//
//         await shutdownUBots(ubotMains);
//     }
//
//     console.error("Sleeping...");
//     await sleep(50000);
// });

// unit.test("ubot_pro_test: simple 10 cloud methods", async () => {
//     console.error("Sleeping...");
//     await sleep(10000);
//
//     let ubotMains = await createUBots(ubotsCount);
//     for (let i = 0; i < 10; i++) {
//         let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();
//
//         let executableContract = await generateSecureRandomExecutableContract();
//
//         executableContract.state.data.js = `
//         async function getRandom(max) {
//             await writeSingleStorage({result: max});
//
//             return max;
//         }
//         `;
//         await executableContract.seal();
//
//         let requestContract = await generateSecureRandomRequestContract(executableContract);
//
//         let session = await ubotClient.startCloudMethod(requestContract);
//
//         console.log("Session: " + session);
//
//         let state = await ubotClient.getStateCloudMethod(requestContract.id);
//         console.log("State: " + JSON.stringify(state));
//
//         if (state.state !== UBotPoolState.FINISHED.val)
//             state = await ubotClient.waitCloudMethod(requestContract.id);
//
//         console.log("State: " + JSON.stringify(state));
//
//         let states = await Promise.all(session.pool.map(async (ubotNumber) => {
//             let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);
//
//             if (state.state !== UBotPoolState.FINISHED.val)
//                 state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);
//
//             return state;
//         }));
//
//         console.log("Final states: " + JSON.stringify(states));
//
//         assert(states.filter(state =>
//             state.state === UBotPoolState.FINISHED.val &&
//             typeof state.result === "number" && state.result === 1000    // checking secure random value
//         ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);
//
//         // waiting pool finished...
//         while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
//             await sleep(100);
//
//         assert(session.pool.filter(
//             ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
//             executableContract.state.data.cloud_methods.getRandom.quorum.size);
//
//         await ubotClient.shutdown();}
//     await shutdownUBots(ubotMains);
//
//     console.error("Sleeping...");
//     await sleep(50000);
// });

unit.test("ubot_pro_test: start client", async () => {
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();

    await ubotClient.shutdown();
});

unit.test("ubot_pro_test: start cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);
    //for (let i = 0; i < 10; i++) {
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let session = await ubotClient.startCloudMethod(requestContract);

    console.log("Session: " + session);

    let state = await ubotClient.getStateCloudMethod(requestContract.id);
    console.log("State: " + JSON.stringify(state));

    if (state.state !== UBotPoolState.FINISHED.val)
        state = await ubotClient.waitCloudMethod(requestContract.id);

    console.log("State: " + JSON.stringify(state));

    let states = await Promise.all(session.pool.map(async (ubotNumber) => {
        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);

        if (state.state !== UBotPoolState.FINISHED.val)
            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);

        return state;
    }));

    console.log("Final states: " + JSON.stringify(states));

    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        typeof state.result === "number" && state.result >= 0 && state.result < 1000    // checking secure random value
    ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

    // waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.getRandom.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: 2 cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let session = await ubotClient.startCloudMethod(requestContract);

    console.log("Session: " + session);

    let state = await ubotClient.getStateCloudMethod(requestContract.id);
    console.log("State: " + JSON.stringify(state));

    if (state.state !== UBotPoolState.FINISHED.val)
        state = await ubotClient.waitCloudMethod(requestContract.id);

    console.log("State: " + JSON.stringify(state));

    let states = await Promise.all(session.pool.map(async (ubotNumber) => {
        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);

        if (state.state !== UBotPoolState.FINISHED.val)
            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);

        return state;
    }));

    console.log("Final states: " + JSON.stringify(states));

    let finalized = states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        typeof state.result === "number" && state.result >= 0 && state.result < 1000    // checking secure random value
    );

    assert(finalized.length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

    let first = finalized[0].result;

    assert(finalized.every(state => state.result === first));

    await ubotClient.disconnectUbot();

    // waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.getRandom.quorum.size);

    //await sleep(5000);
    let sess = null;
    do {
        sess = await ubotClient.getSession("ubotGetSession", {executableContractId: executableContract.id});
    } while (Object.keys(sess).length > 0);

    // SECOND METHOD (READ RANDOM)
    requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "readRandom";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("SECOND METHOD (READ RANDOM)");
    session = await ubotClient.startCloudMethod(requestContract);

    console.log("Session: " + session);

    state = await ubotClient.getStateCloudMethod(requestContract.id);
    console.log("State: " + JSON.stringify(state));

    if (state.state !== UBotPoolState.FINISHED.val)
        state = await ubotClient.waitCloudMethod(requestContract.id);

    console.log("State: " + JSON.stringify(state));

    states = await Promise.all(session.pool.map(async (ubotNumber) => {
        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);

        if (state.state !== UBotPoolState.FINISHED.val)
            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);

        return state;
    }));

    console.log("Final states: " + JSON.stringify(states));

    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        state.result === first                           // checking read random value
    ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

    // waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.getRandom.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: parallel cloud methods", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let promises = [];
    for (let i = 0; i < 1; i++)
        promises.push(new Promise(async (resolve, reject) => {
            try {
                let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();
                let results = [];

                for (let x = 0; x < 1; x++) {
                    let executableContract = await generateSecureRandomExecutableContract();
                    let requestContract = await generateSecureRandomRequestContract(executableContract);

                    let session = await ubotClient.startCloudMethod(requestContract);

                    console.log("Session: " + session);

                    let state = await ubotClient.getStateCloudMethod(requestContract.id);
                    console.log("State: " + JSON.stringify(state));

                    if (state.state !== UBotPoolState.FINISHED.val)
                        state = await ubotClient.waitCloudMethod(requestContract.id);

                    console.log("State: " + JSON.stringify(state));

                    let states = await Promise.all(session.pool.map(async (ubotNumber) => {
                        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);

                        if (state.state !== UBotPoolState.FINISHED.val)
                            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);

                        return state;
                    }));

                    console.log("Final states: " + JSON.stringify(states));

                    let finalized = states.filter(state =>
                        state.state === UBotPoolState.FINISHED.val &&
                        typeof state.result === "number" && state.result >= 0 && state.result < 1000    // checking secure random value
                    );

                    assert(finalized.length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

                    let result = finalized[0].result;
                    results.push(result);

                    assert(finalized.every(state => state.result === result));

                    await ubotClient.disconnectUbot();

                    // waiting pool finished...
                    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
                        await sleep(100);

                    assert(session.pool.filter(
                        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
                        executableContract.state.data.cloud_methods.getRandom.quorum.size);
                }

                await ubotClient.shutdown();

                resolve(results);
            } catch (err) {
                reject(err);
            }
        }));

    let results = await Promise.all(promises);

    console.log("Results = " + JSON.stringify(results));

    await shutdownUBots(ubotMains);
});