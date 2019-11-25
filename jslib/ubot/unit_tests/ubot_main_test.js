/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
import {expect, assert, unit} from 'test'

const io = require("io");
import {HttpServer} from 'web'
import {ExecutorWithFixedPeriod} from "executorservice";

const UBotTestClient = require('ubot/ubot_client').UBotTestClient;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const ItemResult = require('itemresult').ItemResult;
const ItemState = require("itemstate").ItemState;
const ut = require("ubot/ubot_tools");
const cs = require("contractsservice");
const Constraint = require('constraint').Constraint;
const BigDecimal  = require("big").Big;

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const TOPOLOGY_FILE = "mainnet_topology.json";
const TEST_CONTRACTS_PATH = "../jslib/ubot/executable_contracts/";
const ubotsCount = 30;

const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

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

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
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

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    return requestContract;
}

unit.test("ubot_main_test: start client", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    await ubotClient.shutdown();
});

unit.test("ubot_main_test: start cloud method", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

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

    await ubotClient.shutdown();
});

unit.test("ubot_main_test: secure random", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSecureRandomExecutableContract();
    let requestContract = await generateSecureRandomRequestContract(executableContract);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking secure random value
    assert(typeof state.result === "number" && state.result >= 0 && state.result < 1000);

    await ubotClient.shutdown();
});

unit.test("ubot_main_test: execute looped cloud method", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

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

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FAILED.val);

    assert(state.errors[0].error === "FAILURE" && state.errors[0].objectName === "loop" &&
        state.errors[0].message === "Cloud method return error: Quantiser limit is reached");

    await ubotClient.shutdown();
});

unit.test("ubot_main_test: full quorum", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSecureRandomExecutableContract();

    executableContract.state.data.cloud_methods.getRandom = {
        pool: {size: 30},
        quorum: {size: 30}
    };
    await executableContract.seal();

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

    await ubotClient.shutdown();
});

// unit.test("ubot_main_test: register contract", async () => {
//     // simple contract for registration
//     let simpleContract = Contract.fromPrivateKey(userPrivKey);
//     await simpleContract.seal();
//     let packedSimpleContract = await simpleContract.getPackedTransaction();
//
//     let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
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
// });

unit.test("ubot_main_test: create and register contract", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSimpleExecutableContract("createAndRegister.js", "register");
    let requestContract = await generateSimpleRegisterRequestContract(executableContract);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    // checking contract
    assert(state.result instanceof Uint8Array);
    let assureContract = await Contract.fromPackedTransaction(state.result);
    assert(assureContract instanceof Contract);

    let ir = await ubotClient.getState(assureContract.id);
    assert(ir instanceof ItemResult && ir.state === ItemState.APPROVED);

    await ubotClient.shutdown();
});

/*unit.test("ubot_main_test: pool and quorum percentage", async () => {
    // simple contract for registration
    let simpleContract = Contract.fromPrivateKey(userPrivKey);
    await simpleContract.seal();
    let packedSimpleContract = await simpleContract.getPackedTransaction();

    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

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

    // let state = await ubotClient.executeCloudMethod(requestContract, true);
    //
    // console.log("State: " + JSON.stringify(state));
    //
    // assert(state.state === UBotPoolState.FINISHED.val);

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

    // state = await ubotClient.executeCloudMethod(requestContract, true);
    //
    // console.log("State: " + JSON.stringify(state));
    //
    // assert(state.state === UBotPoolState.FINISHED.val);

    await ubotClient.shutdown();
});*/

/*unit.test("ubot_main_test: http requests", async () => {
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

    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

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

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);
    assert(state.result instanceof Array);
    assert(state.result.length >= executableContract.state.data.cloud_methods.stopOrder.quorum.size);
    assert(state.result.every(result => result.price >= stopPrice));

    await ubotClient.shutdown();

    await httpServer.stopServer();
    executor.cancel();
});*/

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
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

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
        state.result != null &&
        state.result.random === first &&                                    // checking read random value
        checkRandomMultiData(state.result.multi_data, state.result.random)  // checking multi-storage
    ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

    await ubotClient.shutdown();
});

unit.test("ubot_pro_test: parallel cloud methods", async () => {
    let promises = [];
    for (let i = 0; i < 2; i++)
        promises.push(new Promise(async (resolve, reject) => {
            try {
                let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
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
                }

                await ubotClient.shutdown();

                resolve(results);
            } catch (err) {
                reject(err);
            }
        }));

    let results = await Promise.all(promises);

    console.log("Results = " + JSON.stringify(results));
});

/*unit.test("ubot_main_test: lottery", async () => {
    //let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    // init ubot-client (client key in whitelist)
    ubotMains[0].ubot.client = await new UBotClient(ubotMains[0].ubot.nodeKey, TOPOLOGY_ROOT + TOPOLOGY_FILE, null, ubotMains[0].ubot.logger).start();

    const TICKETS = 10;

    // test token for payments
    let tokenIssuerKey = ubotMains[0].ubot.nodeKey;
    let tokenContract = await cs.createTokenContract([tokenIssuerKey], [tokenIssuerKey.publicKey], new BigDecimal("1000"));
    let origin = tokenContract.getOrigin();

    console.log("Register base token...");
    let ir = await ubotMains[0].ubot.client.register(await tokenContract.getPackedTransaction(), 10000);

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
        ir = await ubotMains[0].ubot.client.register(await tokenContract.getPackedTransaction(), 10000);

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
            storage_read_trust_level: 0.9,
            max_wait_ubot: 60
        }
    };

    lotteryContract.state.data.js = await io.fileGetContentsAsString(TEST_CONTRACTS_PATH + "lottery.js");
    lotteryContract.state.data.tokenOrigin = origin;
    lotteryContract.state.data.ticketPrice = "10";

    await lotteryContract.seal();

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

        await cs.addConstraintToContract(buyContract, lotteryContract, "executableContractConstraint",
            Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

        let state = await ubotClient.executeCloudMethod(buyContract, true);

        assert(state.state === UBotPoolState.FINISHED.val);
        assert(state.result === i);     // compare ticket number
    }

    // raffle
    let raffleContract = Contract.fromPrivateKey(userPrivKey);
    raffleContract.state.data.method_name = "raffle";
    raffleContract.state.data.executable_contract_id = lotteryContract.id;

    await cs.addConstraintToContract(raffleContract, lotteryContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("Raffle lottery...");
    let state = await ubotClient.executeCloudMethod(raffleContract, true);

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

    await ubotClient.shutdown();
});*/

unit.test("ubot_pro_test: execute cloud method with ubot delay", async () => {
    let ubotClient = await new UBotTestClient("http://104.248.143.106", clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = await generateSimpleExecutableContract("ubotDelay.js", "getNumbers");

    executableContract.state.data.cloud_methods.getNumbers.max_wait_ubot = 10;
    await executableContract.seal();

    // bad request without consensus
    let badRequestContract = Contract.fromPrivateKey(userPrivKey);
    badRequestContract.state.data.method_name = "getNumbers";
    badRequestContract.state.data.method_args = [[2, 3]];
    badRequestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(badRequestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let errMessage = null;
    try {
        await ubotClient.executeCloudMethod(badRequestContract, true);
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

    await cs.addConstraintToContract(requestContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    let state = await ubotClient.executeCloudMethod(requestContract, true);

    console.log("State: " + JSON.stringify(state));

    assert(state.state === UBotPoolState.FINISHED.val);

    let poolSet = new Set();
    assert(state.result.every(numbers => {
        let res = !poolSet.has(numbers.inPool) && numbers.inPool >= 0 && numbers.inPool < 5 && numbers.inPool !== excluded;
        poolSet.add(numbers.inPool);
        return res;
    }));

    await ubotClient.shutdown();
});