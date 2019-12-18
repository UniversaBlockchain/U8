/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, unit} from 'test'
import {KeyAddress, PublicKey, HashId} from 'crypto'
import * as tk from "unit_tests/test_keys";
import * as io from "io";
import {VerboseLevel} from "node_consts";
import {HttpServer} from 'web'
import {ExecutorWithFixedPeriod} from "executorservice";

const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotClient = require('ubot/ubot_client').UBotClient;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const ItemResult = require('itemresult').ItemResult;
const ItemState = require("itemstate").ItemState;
const cs = require("contractsservice");
const roles = require('roles');
const Constraint = require('constraint').Constraint;
const BigDecimal  = require("big").Big;
const t = require("tools");
const ut = require("ubot/ubot_tools");
const tt = require("test_tools");

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const TOPOLOGY_FILE = "mainnet_topology.json";
const CONFIG_ROOT = "../test/config/ubot_config";
const TEST_CONTRACTS_PATH = "../jslib/ubot/executable_contracts/";
const ubotsCount = 30;

const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

async function createPayment(cost) {
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let U = await tt.createFreshU(100000000, [userPrivKey.publicKey]);
    U.registerRole(new roles.SimpleRole("issuer", tk.getTestKey().longAddress));
    await U.seal(true);

    await U.addSignatureToSeal(tk.getTestKey());
    let ir = await netClient.register(await U.getPackedTransaction(), 10000);

    assert(ir.state === ItemState.APPROVED);

    U = await U.createRevision([userPrivKey]);
    U.state.data.transaction_units = U.state.data.transaction_units - cost;
    await U.seal();

    await netClient.shutdown();

    return U;
}

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
    require("ubot/unit_tests/ubot_debugger").ubotDebugger_setMains(ubotMains);
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
            quorum: {size: 4},
            max_wait_ubot: 30
        },
        readRandom: {
            pool: {size: 5},
            quorum: {size: 4},
            max_wait_ubot: 30
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "random.js");

    await executableContract.seal();

    return executableContract;
}

async function generateSecureRandomRequestContract(executableContract) {
    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "getRandom";
    requestContract.state.data.method_args = [1000];
    requestContract.state.data.executable_contract_id = executableContract.id;
    requestContract.newItems.add(executableContract);

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    return requestContract;
}

async function generateSimpleExecutableContract(jsFileName, methodName) {
    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {};
    executableContract.state.data.cloud_methods[methodName] = {
        pool: {size: 5},
        quorum: {size: 4}
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + jsFileName);

    await executableContract.seal();

    return executableContract;
}

async function generateSimpleRegisterRequestContract(executableContract, contractForRegistration = undefined) {
    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "register";
    if (contractForRegistration != null)
        requestContract.state.data.method_args = [contractForRegistration];
    requestContract.state.data.executable_contract_id = executableContract.id;
    requestContract.newItems.add(executableContract);

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
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
//         let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
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
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    await ubotClient.shutdown();
});

unit.test("ubot_pro_test: ping", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    //await ubotMains[10].shutdown();

    let result = await ubotClient.pingUBot(5, 10);

    console.log("Ping result: " + JSON.stringify(result));

    assert(result.UDP > -1 && result.TCP > -1);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: start cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);

    // ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);
    // for (let i = 0; i < 10; i++) {
    // console.error("Iteration = " + i);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let session = await ubotClient.startCloudMethod(requestContract, await createPayment(20));

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

    // close node clients
    // for (let ubot of session.pool) {
    //     for (let httpClient of ubotMains[ubot].ubot.client.httpNodeClients.values())
    //         if (httpClient.nodeNumber !== ubotMains[ubot].ubot.client.httpNodeClient.nodeNumber)
    //             await httpClient.stop();
    //
    //     ubotMains[ubot].ubot.client.httpNodeClients.clear();
    // }

    await ubotClient.shutdown();//}
    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: execute cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);

    // ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);
    // for (let i = 0; i < 10; i++) {
    // console.error("Iteration = " + i);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking secure random value
    assert(typeof state.result === "number" && state.result >= 0 && state.result < 1000);

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);//}
});

// unit.test("ubot_pro_test: random deviation", async () => {
//     let ubotMains = await createUBots(ubotsCount);
//
//     let rands = [];
//
//     // ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);
//     for (let i = 0; i < 10; i++) {
//         console.log("Random iteration: " + i);
//
//         let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
//
//         let executableContract = await generateSecureRandomExecutableContract();
//         let requestContract = await generateSecureRandomRequestContract(executableContract);
//
//         let state = await ubotClient.executeCloudMethod(requestContract, true);
//
//         console.log("State: " + JSON.stringify(state));
//
//         assert(state.state === UBotPoolState.FINISHED.val);
//
//         // checking secure random value
//         assert(typeof state.result === "number" && state.result >= 0 && state.result < 1000);
//
//         await ubotClient.shutdown();
//
//         rands.push(state.result);
//     }
//
//     let summ = new BigDecimal(0);
//     for (let i = 0; i < 1000; i++)
//         for (let j = 0; j < 1000; j++)
//             if (j > i)
//                 summ = summ.add((i - j) * (i - j));
//
//     let variance = summ.div(1000000);
//
//     // calculate standard deviation
//     let avg = 999 / 2;
//     let s = 0;
//     rands.forEach(rnd => s += (rnd - avg) * (rnd - avg));
//     let deviation = Math.sqrt(s / rands.length);
//
//     console.log("Randoms: " + JSON.stringify(rands));
//     console.log("Standard deviation: " + deviation);
//     console.log("Variance: " + variance.toFixed());
//
//     // waiting pool finished...
//     while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
//         await sleep(100);
//
//     await shutdownUBots(ubotMains);
// });

unit.test("ubot_pro_test: execute looped cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);
    executableContract.state.data.cloud_methods = {
        loop: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    //executableContract.state.data.js = "async function loop() {await sleep(300000); while(true) {}}";
    executableContract.state.data.js = "function loop() {while(true) {}}";

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "loop";
    requestContract.state.data.executable_contract_id = executableContract.id;
    requestContract.newItems.add(executableContract);

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(2), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FAILED.val);

    assert(state.errors[0].error === "FAILURE" && state.errors[0].objectName === "loop" &&
           state.errors[0].message === "Cloud method return error: Quantiser limit is reached");

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});

 unit.test("ubot_pro_test: full quorum", async () => {
     let ubotMains = await createUBots(ubotsCount);
     let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

     //ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);

     let executableContract = await generateSecureRandomExecutableContract();

     executableContract.state.data.cloud_methods.getRandom = {
         pool: {size: 16},
         quorum: {size: 16}
     };
     await executableContract.seal();

     let requestContract = await generateSecureRandomRequestContract(executableContract);

     let session = await ubotClient.startCloudMethod(requestContract, await createPayment(64));

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

// unit.test("ubot_pro_test: register contract", async () => {
//     let ubotMains = await createUBots(ubotsCount);
//
//     // simple contract for registration
//     let simpleContract = Contract.fromPrivateKey(userPrivKey);
//     await simpleContract.seal();
//     let packedSimpleContract = await simpleContract.getPackedTransaction();
//
//     let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
//
//     let executableContract = await generateSimpleExecutableContract("simpleRegister.js", "register");
//     let requestContract = await generateSimpleRegisterRequestContract(executableContract, packedSimpleContract);
//
//     let state = await ubotClient.executeCloudMethod(requestContract, true);
//
//     console.log("State: " + JSON.stringify(state));
//
//     assert(state.state === UBotPoolState.FINISHED.val);
//
//     // checking contract
//     assert(state.result instanceof Uint8Array && t.valuesEqual(state.result, packedSimpleContract));
//
//     let ir = await ubotClient.getState(simpleContract.id);
//     assert(ir instanceof ItemResult && ir.state === ItemState.APPROVED);
//
//     await ubotClient.shutdown();
//
//     // waiting pool finished...
//     while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
//         await sleep(100);
//
//     await shutdownUBots(ubotMains);
// });

unit.test("ubot_pro_test: create and register contract", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSimpleExecutableContract("createAndRegister.js", "register");
    let requestContract = await generateSimpleRegisterRequestContract(executableContract);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking contract
    assert(state.result instanceof Uint8Array);
    let assureContract = await Contract.fromPackedTransaction(state.result);
    assert(assureContract instanceof Contract);

    let ir = await ubotClient.getState(assureContract.id);
    assert(ir instanceof ItemResult && ir.state === ItemState.APPROVED);

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: pool and quorum percentage", async () => {
    let ubotMains = await createUBots(ubotsCount);

    // simple contract for registration
    let simpleContract = Contract.fromPrivateKey(userPrivKey);
    await simpleContract.seal();
    let packedSimpleContract = await simpleContract.getPackedTransaction();

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    // pool as constant, quorum as percentage

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        register: {
            pool: {size: 5},
            quorum: {percentage: 80}
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "simpleRegister.js");

    await executableContract.seal();

    let requestContract = await generateSimpleRegisterRequestContract(executableContract, packedSimpleContract);
    let registryContract = await Contract.fromSealedBinary(await ubotClient.getUBotRegistryContract());

    let poolAndQuorum = ut.getPoolAndQuorum(requestContract, registryContract);

    assert(poolAndQuorum.pool === 5);
    assert(poolAndQuorum.quorum === Math.ceil(5 * 80 / 100));

    console.log("Pool: " + poolAndQuorum.pool);
    console.log("Quorum: " + poolAndQuorum.quorum);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // pool and quorum as percentage

    executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        register: {
            pool: {percentage: 20},
            quorum: {percentage: 80}
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "simpleRegister.js");

    await executableContract.seal();

    requestContract = await generateSimpleRegisterRequestContract(executableContract, packedSimpleContract);

    poolAndQuorum = ut.getPoolAndQuorum(requestContract, registryContract);

    assert(poolAndQuorum.pool === Math.ceil(ubotsCount * 20 / 100));
    assert(poolAndQuorum.quorum === Math.ceil(poolAndQuorum.pool * 80 / 100));

    console.log("Pool: " + poolAndQuorum.pool);
    console.log("Quorum: " + poolAndQuorum.quorum);

    state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: http requests", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let price = 3.8;
    let stopPrice = 5.073;

    // test HTTP server with prices
    let httpServer = new HttpServer("0.0.0.0", 8080, 5);
    httpServer.addEndpoint("/getPrice", async (request) => {
        request.setHeader("Content-Type", "text/html");
        return {"price": price};
    });

    // price cycle
    let executor = new ExecutorWithFixedPeriod(() => {
        price += Math.random() / 10;
        console.log("Current price: " + price);
    }, 1000).run();

    httpServer.startServer();

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        stopOrder: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "tradeOrder.js");
    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "stopOrder";
    requestContract.state.data.method_args = [stopPrice];
    requestContract.state.data.executable_contract_id = executableContract.id;
    requestContract.newItems.add(executableContract);

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);
    assert(state.result instanceof Array);
    assert(state.result.length >= executableContract.state.data.cloud_methods.stopOrder.quorum.size);
    assert(state.result.every(result => result.price >= stopPrice));

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await httpServer.stopServer();
    executor.cancel();

    await shutdownUBots(ubotMains);
});

function checkRandomMultiData(multiData, random) {
    let rands = [];
    for (let r of multiData) {
        if (r.hash !== crypto.HashId.of(r.rnd).base64)
            return false;

        rands.push(r.rnd);
    }

    let summRandom = new BigDecimal(0);
    rands.forEach(random => {
        let bigRandom = new BigDecimal(0);
        random.forEach(byte => bigRandom = bigRandom.mul(256).add(byte));
        summRandom = summRandom.add(bigRandom);
    });

    let result = Number.parseInt(summRandom.mod(1000).toFixed());

    return result === random;
}

unit.test("ubot_pro_test: 2 cloud method", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let session = await ubotClient.startCloudMethod(requestContract, await createPayment(20));

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

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("SECOND METHOD (READ RANDOM)");
    session = await ubotClient.startCloudMethod(requestContract, await createPayment(20));

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
        state.result != null &&
        state.result.random === first &&                                    // checking read random value
        checkRandomMultiData(state.result.multi_data, state.result.random)  // checking multi-storage
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

// unit.test("ubot_pro_test: 2 cloud method with executeCloudMethod waiting", async () => {
//     let ubotMains = await createUBots(ubotsCount);
//     let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
//
//     let executableContract = await generateSecureRandomExecutableContract();
//     let requestContract = await generateSecureRandomRequestContract(executableContract);
//
//     await ubotClient.startCloudMethod(requestContract, await createPayment(20));
//
//     await ubotClient.disconnectUbot();
//
//     // WAITING METHOD (READ RANDOM)
//     requestContract = Contract.fromPrivateKey(userPrivKey);
//     requestContract.state.data.method_name = "readRandom";
//     requestContract.state.data.executable_contract_id = executableContract.id;
//
//     await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
//         Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);
//
//     console.log("WAITING METHOD (READ RANDOM)");
//     let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);
//
//     console.log("State: " + JSON.stringify(state));
//
//     assert(state.state === UBotPoolState.FINISHED.val);
//
//     // checking secure random value
//     assert(typeof state.result.random === "number" && state.result.random >= 0 && state.result.random < 1000);
//
//     await ubotClient.shutdown();
//
//     // waiting pool finished...
//     while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
//         await sleep(100);
//
//     await shutdownUBots(ubotMains);
// });

unit.test("ubot_pro_test: parallel cloud methods", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let promises = [];
    for (let i = 0; i < 2; i++)
        promises.push(new Promise(async (resolve, reject) => {
            try {
                let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
                let results = [];

                for (let x = 0; x < 2; x++) {
                    let executableContract = await generateSecureRandomExecutableContract();
                    let requestContract = await generateSecureRandomRequestContract(executableContract);

                    let session = await ubotClient.startCloudMethod(requestContract, await createPayment(20));

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

unit.test("ubot_pro_test: lottery", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    const TICKETS = 10;

    // test token for payments
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));
    let origin = tokenContract.getOrigin();

    console.log("Register base token...");
    let ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);

    assert(ir.state === ItemState.APPROVED);

    let userKeys = [];
    let payments = [];
    console.log("Register initial payments...");
    for (let i = 0; i < TICKETS; i++) {
        let userKey = tk.TestKeys.getKey();

        tokenContract = await cs.createSplit(tokenContract, 10, "amount", [tokenIssuerKey], true);
        let payment = Array.from(tokenContract.newItems)[0];

        payment.registerRole(new roles.SimpleRole("owner", userKey, payment));
        payment.registerRole(new roles.RoleLink("creator", "owner", payment));

        await payment.seal();
        await payment.addSignatureToSeal(userKey);
        await tokenContract.seal();

        userKeys.push(userKey);
        payments.push(payment);

        console.log("Register payment " + i + "...");
        ir = await netClient.register(await tokenContract.getPackedTransaction(), 10000);

        assert(ir.state === ItemState.APPROVED);
    }

    let lotteryKey = tk.TestKeys.getKey();
    let lotteryContract = Contract.fromPrivateKey(lotteryKey);

    lotteryContract.state.data.cloud_methods = {
        buyTicket: {
            pool: {size: 3},
            quorum: {size: 3},
            storage_read_trust_level: 0.51,
            max_wait_ubot: 60
        },
        raffle: {
            pool: {size: 12},
            quorum: {size: 10},
            storage_read_trust_level: 0.75,
            max_wait_ubot: 60
        }
    };

    lotteryContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "lottery.js");
    lotteryContract.state.data.tokenOrigin = origin;
    lotteryContract.state.data.ticketPrice = "10";

    await lotteryContract.seal();

    console.log("Register lottery сontract...");
    ir = await netClient.register(await lotteryContract.getPackedTransaction(), 10000);

    assert(ir.state === ItemState.APPROVED);

    // buy tickets
    console.log("Buy tickets...");
    for (let i = 0; i < TICKETS; i++) {
        let payment = await payments[i].createRevision([userKeys[i]]);

        // quorum vote role
        payment.registerRole(new roles.QuorumVoteRole("owner", "refUbotRegistry.state.roles.ubots", "10", payment));
        payment.registerRole(new roles.QuorumVoteRole("creator", "refUbotRegistry.state.roles.ubots", "3", payment));

        // constraint for UBotNet registry contract
        payment.createTransactionalSection();
        let constr = new Constraint(payment);
        constr.name = "refUbotRegistry";
        constr.type = Constraint.TYPE_TRANSACTIONAL;
        let conditions = {};
        conditions[Constraint.conditionsModeType.all_of] = ["ref.tag == \"universa:ubot_registry_contract\""];
        constr.setConditions(conditions);
        payment.addConstraint(constr);

        await payment.seal();

        payment = await payment.getPackedTransaction();

        let buyContract = Contract.fromPrivateKey(userKeys[i]);
        buyContract.state.data.method_name = "buyTicket";
        buyContract.state.data.method_args = [payment, userKeys[i].publicKey];
        buyContract.state.data.executable_contract_id = lotteryContract.id;

        await cs.addConstraintToContract(buyContract, lotteryContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        let state = await ubotClient.executeCloudMethod(buyContract, await createPayment(12), true);

        assert(state.state === UBotPoolState.FINISHED.val);
        assert(state.result === i);     // compare ticket number
    }

    // raffle
    let raffleContract = Contract.fromPrivateKey(userPrivKey);
    raffleContract.state.data.method_name = "raffle";
    raffleContract.state.data.executable_contract_id = lotteryContract.id;

    await cs.addConstraintToContract(raffleContract, lotteryContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("Raffle lottery...");
    let state = await ubotClient.executeCloudMethod(raffleContract, await createPayment(50), true);

    assert(state.state === UBotPoolState.FINISHED.val);

    // check raffle result
    assert(state.result.hasOwnProperty("winTicket") && state.result.prizeContract instanceof Uint8Array);
    assert(state.result.hasOwnProperty("prizeContract") && typeof state.result.winTicket === "number" &&
           state.result.winTicket >= 0 && state.result.winTicket < TICKETS);

    console.log("Win ticket: " + state.result.winTicket);

    // check prize contract
    let prizeContract = await Contract.fromPackedTransaction(state.result.prizeContract);
    assert(prizeContract.roles.owner instanceof roles.SimpleRole);

    let keys = roles.RoleExtractor.extractKeys(prizeContract.roles.owner);
    assert(keys.size === 1 && keys.has(userKeys[state.result.winTicket].publicKey));

    assert(prizeContract.getOrigin().equals(origin));
    assert(prizeContract.state.data.amount === "100");

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await netClient.shutdown();
    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: execute cloud method with ubot delay", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSimpleExecutableContract("ubotDelay.js", "getNumbers");

    executableContract.state.data.cloud_methods.getNumbers.max_wait_ubot = 30;
    await executableContract.seal();

    // bad request without consensus
    let badRequestContract = Contract.fromPrivateKey(userPrivKey);
    badRequestContract.state.data.method_name = "getNumbers";
    badRequestContract.state.data.method_args = [[2, 3]];
    badRequestContract.state.data.executable_contract_id = executableContract.id;
    badRequestContract.newItems.add(executableContract);

    await cs.addConstraintToContract(badRequestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let errMessage = null;
    try {
        await ubotClient.executeCloudMethod(badRequestContract, await createPayment(20), true);
    } catch (err) {
        errMessage = err.message;
    }

    console.log("Error: " + errMessage);

    assert(errMessage.startsWith("Cloud method consensus can`t be reached"));

    // normal request with minimal consensus (quorum)
    let excluded = 3;

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "getNumbers";
    requestContract.state.data.method_args = [[excluded]];
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    let poolSet = new Set();
    assert(state.result.every(numbers => {
        let res = !poolSet.has(numbers.inPool) && numbers.inPool >= 0 && numbers.inPool < 5 && numbers.inPool !== excluded;
        poolSet.add(numbers.inPool);
        return res;
    }));

    await ubotClient.shutdown();//}

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_main_test: sequential launch", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        method_for_launcher1: {
            pool: {size: 8},
            quorum: {size: 3}
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "launcherRole.js");

    await executableContract.seal();

    for (let i = 0; i < 50; i++) {
        let requestContract = Contract.fromPrivateKey(userPrivKey);
        requestContract.state.data.method_name = "method_for_launcher1";
        requestContract.state.data.executable_contract_id = executableContract.id;
        if (i === 0)
            requestContract.newItems.add(executableContract);

        await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        let state = await ubotClient.executeCloudMethod(requestContract, await createPayment(20), true);

        assert(state.state === UBotPoolState.FINISHED.val);
        assert(state.result === 1);
    }

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_pro_test: launcher role", async () => {
    let ubotMains = await createUBots(ubotsCount);

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    let userKey1 = tk.TestKeys.getKey();
    let userKey2 = tk.TestKeys.getKey();

    executableContract.registerRole(new roles.SimpleRole("launcherRole1", userKey1));
    executableContract.registerRole(new roles.SimpleRole("launcherRole2", userKey2));

    executableContract.state.data.cloud_methods = {
        method_for_launcher1: {
            pool: {size: 5},
            quorum: {size: 3},
            launcher: "launcherRole1"
        },
        method_for_launcher2: {
            pool: {size: 3},
            quorum: {size: 2},
            launcher: "launcherRole2"
        },
        method_for_any: {
            pool: {size: 3},
            quorum: {size: 2}
        }
    };

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "launcherRole.js");

    await executableContract.seal();

    // method_for_launcher1
    let launcher1Contract = Contract.fromPrivateKey(userKey1);
    launcher1Contract.state.data.method_name = "method_for_launcher1";
    launcher1Contract.state.data.executable_contract_id = executableContract.id;
    launcher1Contract.newItems.add(executableContract);

    await cs.addConstraintToContract(launcher1Contract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    await cs.addConstraintToContract(launcher1Contract, executableContract, "launcher_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this can_perform ref.state.roles.launcherRole1"], true);

    console.log("method_for_launcher1...");

    let state = await ubotClient.executeCloudMethod(launcher1Contract, await createPayment(5), true);

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking contract
    assert(state.result === 1);

    //TODO negative test
    launcher1Contract = Contract.fromPrivateKey(userPrivKey);
    launcher1Contract.state.data.method_name = "method_for_launcher1";
    launcher1Contract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(launcher1Contract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    await cs.addConstraintToContract(launcher1Contract, executableContract, "launcher_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this can_perform ref.state.roles.launcherRole1"], true);

    state = await ubotClient.executeCloudMethod(launcher1Contract, await createPayment(5), true);

    assert(state.state === UBotPoolState.FAILED.val);

    // checking contract
    console.error(JSON.stringify(state));

    // method_for_launcher2
    let launcher2Contract = Contract.fromPrivateKey(userKey2);
    launcher2Contract.state.data.method_name = "method_for_launcher2";
    launcher2Contract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(launcher2Contract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    await cs.addConstraintToContract(launcher2Contract, executableContract, "launcher_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this can_perform ref.state.roles.launcherRole2"], true);

    console.log("method_for_launcher2...");

    state = await ubotClient.executeCloudMethod(launcher2Contract, await createPayment(5), true);

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking contract
    assert(state.result === 2);

    // method_for_launcher2
    //TODO negative test

    // launcher2Contract = Contract.fromPrivateKey(userKey1);
    // launcher2Contract.state.data.method_name = "method_for_launcher2";
    // launcher2Contract.state.data.executable_contract_id = executableContract.id;
    //
    // await cs.addConstraintToContract(launcher2Contract, executableContract, "executable_contract_constraint",
    //     Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);
    //
    // await cs.addConstraintToContract(launcher2Contract, executableContract, "launcher_constraint",
    //     Constraint.TYPE_EXISTING_STATE, ["this can_perform ref.state.roles.launcherRole2"], true);
    //
    // console.log("method_for_launcher2...");
    //
    // state = await ubotClient.executeCloudMethod(launcher2Contract, await createPayment(5), true);
    //
    // assert(state.state === UBotPoolState.FINISHED.val);
    //
    // // checking contract
    // assert(state.result === 2);

    // method_for_any
    let anyContract = Contract.fromPrivateKey(userKey1);
    anyContract.state.data.method_name = "method_for_any";
    anyContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(anyContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("method_for_any...");

    state = await ubotClient.executeCloudMethod(anyContract, await createPayment(5), true);

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking contract
    assert(state.result === 3);

    await ubotClient.shutdown();

    // waiting pool finished...
    while (ubotMains.some(main => Array.from(main.ubot.processors.values()).some(proc => proc.state.canContinue)))
        await sleep(100);

    await shutdownUBots(ubotMains);
});