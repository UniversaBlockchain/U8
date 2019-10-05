/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, unit} from 'test'
import {SimpleRole, ListRole, ListRoleMode} from 'roles'
import {KeyAddress, PublicKey, HashId} from 'crypto'
import * as tk from "unit_tests/test_keys";
import * as io from "io";
import {VerboseLevel} from "node_consts";

const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotClient = require('ubot/ubot_client').UBotClient;
const cs = require("contractsservice");
const Constraint = require('constraint').Constraint;
const BigDecimal  = require("big").Big;

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const CONFIG_ROOT = "../test/config/ubot_config";
const TEST_CONTRACTS_PATH = "../jslib/ubot/executable_contracts/";
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

    executableContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "random.js");

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

    // ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);
    // for (let i = 0; i < 10; i++) {
    // console.error("Iteration = " + i);

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

    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking secure random value
    assert(typeof state.result === "number" && state.result >= 0 && state.result < 1000);

    await ubotClient.shutdown();//}
    await shutdownUBots(ubotMains);
});

// unit.test("ubot_pro_test: full quorum", async () => {
//     let ubotMains = await createUBots(ubotsCount);
//     let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();
//
//     //ubotMains.forEach(main => main.ubot.network.verboseLevel = VerboseLevel.BASE);
//
//     let executableContract = await generateSecureRandomExecutableContract();
//
//     executableContract.state.data.cloud_methods.getRandom = {
//         pool: {size: 30},
//         quorum: {size: 30}
//     };
//     await executableContract.seal();
//
//     let requestContract = await generateSecureRandomRequestContract(executableContract);
//
//     let session = await ubotClient.startCloudMethod(requestContract);
//
//     console.log("Session: " + session);
//
//     let state = await ubotClient.getStateCloudMethod(requestContract.id);
//     console.log("State: " + JSON.stringify(state));
//
//     if (state.state !== UBotPoolState.FINISHED.val)
//         state = await ubotClient.waitCloudMethod(requestContract.id);
//
//     console.log("State: " + JSON.stringify(state));
//
//     let states = await Promise.all(session.pool.map(async (ubotNumber) => {
//         let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);
//
//         if (state.state !== UBotPoolState.FINISHED.val)
//             state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);
//
//         return state;
//     }));
//
//     console.log("Final states: " + JSON.stringify(states));
//
//     assert(states.filter(state =>
//         state.state === UBotPoolState.FINISHED.val &&
//         typeof state.result === "number" && state.result >= 0 && state.result < 1000    // checking secure random value
//     ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);
//
//     // waiting pool finished...
//     while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
//         await sleep(100);
//
//     assert(session.pool.filter(
//         ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
//         executableContract.state.data.cloud_methods.getRandom.quorum.size);
//
//     await ubotClient.shutdown();
//     await shutdownUBots(ubotMains);
// });

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
    for (let i = 0; i < 2; i++)
        promises.push(new Promise(async (resolve, reject) => {
            try {
                let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();
                let results = [];

                for (let x = 0; x < 2; x++) {
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

unit.test("ubot_pro_test: lottery", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + "universa.pro.json").start();

    const TICKETS = 10;

    // test token fro payments
    let tokenIssuerKey = tk.TestKeys.getKey();
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));

    let lotteryKey = tk.TestKeys.getKey();
    let lotteryContract = Contract.fromPrivateKey(lotteryKey);

    lotteryContract.state.data.cloud_methods = {
        buyTicket: {
            pool: {size: 3},
            quorum: {size: 3}
        },
        raffle: {
            pool: {size: 12},
            quorum: {size: 10}
        }
    };

    lotteryContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "lottery.js");

    await lotteryContract.seal();

    // UBotNet registry contract load from Universa MainNet by getServiceContracts
    let serviceContracts = await new Promise(async (resolve, reject) =>
        await ubotClient.httpNodeClient.command("getServiceContracts", null,
            result => resolve(result),
            error => reject(error)
        )
    );

    assert(serviceContracts != null && serviceContracts.contracts != null && serviceContracts.contracts.ubot_registry_contract != null);

    let ubotnetRegistry = await Contract.fromSealedBinary(serviceContracts.contracts.ubot_registry_contract);
    let ubotRoles = [];

    ubotnetRegistry.state.data.topology.forEach(ubot => ubotRoles.push(new SimpleRole("ubot" + ubot.number, new PublicKey(atob(ubot.key)))));

    // biy tickets
    let userKeys = [];
    let payments = [];
    for (let i = 0; i < TICKETS; i++) {
        let userKey = tk.TestKeys.getKey();

        tokenContract = await cs.createSplit(tokenContract, 10, "amount", [tokenIssuerKey], true);
        let payment = Array.from(tokenContract.newItems)[0];

        payment.owner = new ListRole("poolRole", ubotRoles, ListRoleMode.QUORUM, 10);
        await payment.seal();

        let buyContract = Contract.fromPrivateKey(userKey);
        buyContract.state.data.method_name = "buyTicket";
        buyContract.state.data.method_args = [payment];
        buyContract.state.data.executable_contract_id = lotteryContract.id;

        await cs.addConstraintToContract(buyContract, lotteryContract, "executableContractConstraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        userKeys.push(userKey);
        payments.push(payment);

        // let state = await ubotClient.executeCloudMethod(buyContract, true);
        //
        // assert(state.state === UBotPoolState.FINISHED.val);
        // assert(state.result instanceof Contract);



        // let session = await ubotClient.startCloudMethod(buyContract);
        //
        // console.log("Session: " + session);
        //
        // let state = await ubotClient.getStateCloudMethod(buyContract.id);
        // console.log("State: " + JSON.stringify(state));
        //
        // if (state.state !== UBotPoolState.FINISHED.val)
        //     state = await ubotClient.waitCloudMethod(buyContract.id);
        //
        // console.log("State: " + JSON.stringify(state));
        //
        // let states = await Promise.all(session.pool.map(async (ubotNumber) => {
        //     let state = await ubotClient.getStateCloudMethod(buyContract.id, ubotNumber);
        //
        //     if (state.state !== UBotPoolState.FINISHED.val)
        //         state = await ubotClient.waitCloudMethod(buyContract.id, ubotNumber);
        //
        //     return state;
        // }));
        //
        // console.log("Final states: " + JSON.stringify(states));
        //
        // let finalized = states.filter(state =>
        //     state.state === UBotPoolState.FINISHED.val &&
        //     typeof state.result === "number" && state.result >= 0 && state.result < 1000    // checking secure random value
        // );
        //
        // assert(finalized.length >= lotteryContract.state.data.cloud_methods.buyTicket.quorum.size);
        //
        // let ticket = finalized[0].result;
        //
        // //assert(finalized.every(state => state.result === first));
        //
        // await ubotClient.disconnectUbot();
        //
        // // waiting pool finished...
        // while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(buyContract.id.base64).state.canContinue))
        //     await sleep(100);
        //
        // assert(session.pool.filter(
        //     ubot => ubotMains[ubot].ubot.processors.get(buyContract.id.base64).state === UBotPoolState.FINISHED).length >=
        //     lotteryContract.state.data.cloud_methods.buyTicket.quorum.size);
        //
        // let sess = null;
        // do {
        //     sess = await ubotClient.getSession("ubotGetSession", {executableContractId: lotteryContract.id});
        // } while (Object.keys(sess).length > 0);
    }

    // raffle
    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "raffle";
    requestContract.state.data.executable_contract_id = lotteryContract.id;

    await cs.addConstraintToContract(requestContract, lotteryContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    // console.log("RAFFLE LOTTERY");
    // let session = await ubotClient.startCloudMethod(requestContract);
    //
    // console.log("Session: " + session);
    //
    // let state = await ubotClient.getStateCloudMethod(requestContract.id);
    // console.log("State: " + JSON.stringify(state));
    //
    // if (state.state !== UBotPoolState.FINISHED.val)
    //     state = await ubotClient.waitCloudMethod(requestContract.id);
    //
    // console.log("State: " + JSON.stringify(state));
    //
    // let states = await Promise.all(session.pool.map(async (ubotNumber) => {
    //     let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);
    //
    //     if (state.state !== UBotPoolState.FINISHED.val)
    //         state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);
    //
    //     return state;
    // }));
    //
    // console.log("Final states: " + JSON.stringify(states));
    //
    // // checking result
    // // assert(states.filter(state =>
    // //     state.state === UBotPoolState.FINISHED.val &&
    // //     state.result === first
    // // ).length >= lotteryContract.state.data.cloud_methods.getRandom.quorum.size);
    //
    // // waiting pool finished...
    // while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
    //     await sleep(100);
    //
    // assert(session.pool.filter(
    //     ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
    //     lotteryContract.state.data.cloud_methods.getRandom.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});