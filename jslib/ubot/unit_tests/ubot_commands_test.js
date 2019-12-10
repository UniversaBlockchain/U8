/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
import * as db from "pg_driver";
import {expect, assert, unit} from 'test'

const io = require("io");
const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotClient = require('ubot/ubot_client').UBotClient;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const Errors = require("errors").Errors;
const Boss = require("boss");
const cs = require("contractsservice");
const Constraint = require('constraint').Constraint;

const CONFIG_ROOT = "../test/config/ubot_config"; //io.getTmpDirPath() + "/ubot_config";
const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";
const TOPOLOGY_FILE = "mainnet_topology.json";
const ubotsCount = 30;

async function prepareConfigFiles(count) {
    await io.removeDir(CONFIG_ROOT);
    await io.createDir(CONFIG_ROOT);
    let keys = [];
    for (let i = 0; i < count; ++i)
        keys.push(await crypto.PrivateKey.generate(2048));
    console.log("prepareConfigFiles, configRoot: " + CONFIG_ROOT);
    let ubotNamePrefix = "ubot_";
    let configs = [];
    for (let i = 0; i < count; ++i) {
        let ubotName = ubotNamePrefix + i;
        let yamlStr = "---\n";
        yamlStr += "http_client_port: "+(18000+i)+"\n";
        yamlStr += "http_public_port: "+(17000+i)+"\n";
        yamlStr += "udp_server_port: "+(16000+i)+"\n";
        yamlStr += "database: host=localhost port=5432 dbname=ubot_t"+i+"\n";
        yamlStr += "node_number: "+i+"\n";
        yamlStr += "public_host: localhost\n";
        yamlStr += "node_name: "+ubotName+"\n";
        yamlStr += "ip:\n";
        yamlStr += "- 127.0.0.1\n";
        configs.push(yamlStr);
    }
    for (let i = 0; i < count; ++i) {
        let ubotConfigDir = CONFIG_ROOT + "/ubot" + i;
        await io.createDir(ubotConfigDir);
        let ubotName = ubotNamePrefix + i;
        let ubotPrivKeyDir = ubotConfigDir + "/tmp";
        await io.createDir(ubotPrivKeyDir);
        let ubotPrivKeyPath = ubotPrivKeyDir + "/" + ubotName + ".private.unikey";
        await io.filePutContents(ubotPrivKeyPath, keys[i].packed);
        let ownUbotConfigDir = ubotConfigDir + "/config";
        await io.createDir(ownUbotConfigDir);
        let ownUbotConfigPath = ownUbotConfigDir + "/config.yaml";
        await io.filePutContents(ownUbotConfigPath, configs[i]);
        for (let j = 0; j < count; ++j) {
            let otherUbotName = ubotNamePrefix + j;
            let otherUbotPubKeyDir = ubotConfigDir + "/config/keys";
            await io.createDir(otherUbotPubKeyDir);
            let otherUbotConfigDir = ubotConfigDir + "/config/nodes";
            await io.createDir(otherUbotConfigDir);
            let otherUbotPubKeyPath = otherUbotPubKeyDir+"/"+otherUbotName+".public.unikey";
            let otherUbotConfigPath = otherUbotConfigDir+"/"+otherUbotName+".yaml";
            await io.filePutContents(otherUbotPubKeyPath, keys[j].publicKey.packed);
            await io.filePutContents(otherUbotConfigPath, configs[j]);
        }
    }
}

async function dropAllTables(count) {
    console.log("======================== dropAllTables ========================");
    let unlockFile = io.getTmpDirPath() + "/unlock_dropAllTables_45b72e15c8b5";
    let enabled = await io.isAccessible(unlockFile);
    if (!enabled) {
        console.error("  Operation not permitted. To unlock it, please touch " + unlockFile);
        await sleep(9000);
    } else {
        let promises = [];
        for (let i = 0; i < count; ++i) {
            promises.push(new Promise(resolve => {
                let pool = null;
                db.connect("host=localhost port=5432 dbname=ubot_t" + i, (p) => {
                    pool = p;
                }, (e) => {
                    throw new Error("error: dropAllTables.connect.onError: " + e);
                }, 1);
                pool.withConnection(con => {
                    con.executeQuery(async qr => {
                        let rows = qr.getRows(0);
                        for (let i = 0; i < rows.length; ++i) {
                            let resolver;
                            let promise = new Promise(resolve => resolver = resolve);
                            con.executeUpdate(affectedRows => {
                                resolver();
                            }, err => {
                                throw new Error("error: dropAllTables.executeUpdate.onError: " + err);
                            }, "DROP TABLE " + rows[i][0] + " CASCADE");
                            await promise;
                        }
                        con.release();
                        resolve();
                    }, err => {
                        con.release();
                        throw new Error("error: dropAllTables.executeQuery.onError: " + err);
                    }, "SELECT tablename FROM pg_tables where schemaname = 'public'");
                });
            }));
        }
        await Promise.all(promises);
    }
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
    return ubotMains;
}

async function shutdownUBots(ubots) {
    let promises = [];
    for (let i = 0; i < ubots.length; ++i)
        promises.push(ubots[i].shutdown());
    return Promise.all(promises);
}

unit.test("ubot_commands_test: executeCloudMethod", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        ubotAsm: {
            pool: {size: 5},
            quorum: {size: 4},
            writesTo: [{storage_name: "default"}],
            ubotAsm:
                "calc2x2;" + // should approve write to single storage, each ubot has same value
                "moveTo var1;" +
                "writeSingleStorage;" +
                "moveFrom var1;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        default: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);
    requestContract.state.data.method_name = "ubotAsm";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(async state =>
        state.state === UBotPoolState.FINISHED.val &&
        (await Boss.load(state.result)).val === 4
    ).length >= executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: generateRandomHash", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        ubotAsm: {
            pool: {size: 5},
            quorum: {size: 4},
            writesTo: [{storage_name: "default"}],
            ubotAsm:
                "generateRandomHash;" + // should approve write to multi storage, each ubot has random value
                "moveTo var1;" +
                "writeMultiStorage;" +
                "moveFrom var1;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        default: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "ubotAsm";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        state.result.length === 96  // checking length of random hash
    ).length >= executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

     assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: errorOutput", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        ubotAsm: {
            pool: {size: 5},
            quorum: {size: 6},
            writesTo: [{storage_name: "default"}],
            ubotAsm:
                "calc2x2;" + // should approve write to single storage, each ubot has same value
                "moveTo var1;" +
                "writeSingleStorage;" +
                "moveFrom var1;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        default: {
            pool: {size: 5},
            quorum: {size: 6}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "ubotAsm";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

    let session = await ubotClient.startCloudMethod(requestContract);

    console.log("Session: " + session);

    let state = await ubotClient.getStateCloudMethod(requestContract.id);
    console.log("State: " + JSON.stringify(state));

    if (state.state !== UBotPoolState.FINISHED.val)
        state = await ubotClient.waitCloudMethod(requestContract.id);

    console.log("State: " + JSON.stringify(state));

    let states = await Promise.all(session.pool.map(async (ubotNumber) => {
        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);
        if (state.state !== UBotPoolState.FAILED.val)
            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);
        return state;
    }));

    console.log("Final states: " + JSON.stringify(states));

    assert(states.every(state =>
        state.state === UBotPoolState.FAILED.val &&
        state.errors.length === 1 &&
        state.errors[0].error === Errors.FAILURE &&
        state.errors[0].objectName === "UBotProcess_writeSingleStorage" &&
        state.errors[0].message === "writing to single storage declined"
    ));

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.every(ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FAILED));

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: multi-verify method", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        main: {
            pool: {size: 5},
            quorum: {size: 4},
            writesTo: [{storage_name: "special", multistorage_verify_method: "special_verify"}],
            ubotAsm:
                "generateRandomHash;" +
                "moveTo var1;" +
                "newObj;" +
                "insertObj hash;" +
                "writeMultiStorage special;" +
                "finish"
        },
        special_verify: {
            ubotAsm:
                "hasOwnProperty hash;" +
                "ifTrue 1;" +
                "finish;" +
                "null;" +
                "equal;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        special: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "main";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        state.result.length === 96      // checking length of random hash
    ).length >= executableContract.state.data.cloud_methods.main.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.main.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: multi-verify method failed", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        main: {
            pool: {size: 5},
            quorum: {size: 4},
            writesTo: [{storage_name: "special", multistorage_verify_method: "special_verify"}],
            ubotAsm:
                "generateRandomHash;" +
                "moveTo var1;" +
                "newObj;" +
                "insertObj hash;" +
                "writeMultiStorage special;" +
                "finish"
        },
        special_verify: {
            ubotAsm:
                "hasOwnProperty hashhh;" +
                "ifTrue 1;" +
                "finish;" +
                "null;" +
                "equal;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        special: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "main";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

    let session = await ubotClient.startCloudMethod(requestContract);

    console.log("Session: " + session);

    let state = await ubotClient.getStateCloudMethod(requestContract.id);
    console.log("State: " + JSON.stringify(state));

    if (state.state !== UBotPoolState.FINISHED.val)
        state = await ubotClient.waitCloudMethod(requestContract.id);

    console.log("State: " + JSON.stringify(state));

    let states = await Promise.all(session.pool.map(async (ubotNumber) => {
        let state = await ubotClient.getStateCloudMethod(requestContract.id, ubotNumber);
        if (state.state !== UBotPoolState.FAILED.val)
            state = await ubotClient.waitCloudMethod(requestContract.id, ubotNumber);
        return state;
    }));

    console.log("Final states: " + JSON.stringify(states));

    assert(states.every(state =>
        state.state === UBotPoolState.FAILED.val &&
        state.errors.length === 1 &&
        state.errors[0].error === Errors.FAILURE &&
        state.errors[0].objectName === "UBotProcess_writeMultiStorage" &&
        state.errors[0].message === "failed self result verification"
    ));

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.every(ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FAILED));

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: call sub-method", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        main: {
            pool: {size: 5},
            quorum: {size: 4},
            ubotAsm:
                "generateRandomHash;" +
                "moveTo var1;" +
                "call sub;" +
                "equal;" +
                "ifFalse 1;" +
                "calc2x2;" +
                "finish"
        },
        sub: {
            writesTo: [{storage_name: "default"}],
            readsFrom: [{storage_name: "default"}],
            ubotAsm:
                "moveTo var1;" +
                "null;" +
                "equal;" +
                "ifTrue 3;" +
                "moveFrom var1;" +
                "writeMultiStorage;" +
                "getRecords;" +
                "moveFrom var1;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        default: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "main";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(async state =>
        state.state === UBotPoolState.FINISHED.val &&
        (await Boss.load(state.result)).val === 4
    ).length >= executableContract.state.data.cloud_methods.main.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.main.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});

/*unit.test("ubot_commands_test: secureRandom", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        getRandom: {
            pool: {size: 5},
            quorum: {size: 4},
            readsFrom: [{storage_name: "internal"}],
            writesTo: [{storage_name: "result"}],
            ubotAsm:
                "call step1;" +
                "call step2;" +
                "getRecords internal;" +
                "aggregateRandom;" +
                "moveTo var1;" +
                "newObj;" +
                "insertObj random;" +
                "writeSingleStorage result;" +
                "moveFrom var1;" +
                "finish"
        },
        step1: {
            writesTo: [{storage_name: "internal", multistorage_verify_method: "step1_verify"}],
            ubotAsm:
                "generateRandomHash;" +
                "moveTo var2;" +
                "getHash;" +
                "moveTo var1;" +
                "newObj;" +
                "insertObj hash;" +
                "writeMultiStorage internal;" +
                "putLocalStorage recordId;" +
                "moveFrom var2;" +
                "putLocalStorage random;" +
                "finish"
        },
        step2: {
            readsFrom: [{storage_name: "internal"}],
            writesTo: [{storage_name: "internal", multistorage_verify_method: "step2_verify"}],
            ubotAsm:
                "getLocalStorage random;" +
                "moveTo var2;" +
                "getHash;" +
                "moveTo var1;" +
                "newObj;" +
                "moveTo var3;" +
                "insertObj hash;" +
                "moveFrom var2;" +
                "moveTo var1;" +
                "moveFrom var3;" +
                "insertObj random;" +
                "moveTo var1;" +
                "getLocalStorage recordId;" +
                "replaceMultiStorage internal;" +
                "finish"
        },
        step1_verify: {
            ubotAsm:
                "hasOwnProperty hash;" +
                "ifTrue 1;" +
                "finish;" +
                "null;" +
                "equal;" +
                "finish"
        },
        step2_verify: {
            ubotAsm:
                "moveTo var3;" +
                "getObj hash;" +
                "moveTo var2;" +
                "moveFrom var1;" +
                "getObj hash;" +
                "moveTo var1;" +
                "moveFrom var2;" +
                "equal;" +
                "ifTrue 1;" +
                "finish;" +
                "moveFrom var3;" +
                "getObj random;" +
                "getHash;" +
                "moveTo var1;" +
                "moveFrom var2;" +
                "equal;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        internal: {
            pool: {size: 5},
            quorum: {size: 4}
        },
        result: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "getRandom";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        state.result.length === 96      // checking length of random hash
    ).length >= executableContract.state.data.cloud_methods.getRandom.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.getRandom.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});*/

unit.test("ubot_commands_test: getDataByRecordId", async () => {
    let ubotMains = await createUBots(ubotsCount);
    let ubotClient = await new UBotClient(clientKey, TOPOLOGY_ROOT + TOPOLOGY_FILE).start();

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        ubotAsm: {
            pool: {size: 5},
            quorum: {size: 4},
            writesTo: [{storage_name: "storage"}],
            ubotAsm:
                "generateRandomHash;" + // should approve write to multi storage, each ubot has random value
                "moveTo var1;" +
                "writeMultiStorage storage;" +
                "moveTo var3;" +
                "getMultiDataByRecordId;" +
                "equal;" +
                "ifTrue 1;" +
                "finish;" +
                "moveFrom var3;" +
                "moveTo var1;" +
                "writeSingleStorage storage;" +
                "getSingleDataByRecordId;" +
                "equal;" +
                "finish"
        }
    };

    executableContract.state.data.cloud_storages = {
        storage: {
            pool: {size: 5},
            quorum: {size: 4}
        }
    };

    await executableContract.seal();

    let requestContract = Contract.fromPrivateKey(userPrivKey);

    requestContract.state.data.method_name = "ubotAsm";
    requestContract.state.data.executable_contract_id = executableContract.id;

    await cs.addConstraintToContract(requestContract, executableContract, "executable_contract_constraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executable_contract_id == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("requestContract.id: " + requestContract.id);

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
    }))

    console.log("Final states: " + JSON.stringify(states));
    assert(states.filter(state =>
        state.state === UBotPoolState.FINISHED.val &&
        state.result
    ).length >= executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    //waiting pool finished...
    while (!session.pool.every(ubot => !ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state.canContinue))
        await sleep(100);

    assert(session.pool.filter(
        ubot => ubotMains[ubot].ubot.processors.get(requestContract.id.base64).state === UBotPoolState.FINISHED).length >=
        executableContract.state.data.cloud_methods.ubotAsm.quorum.size);

    await ubotClient.shutdown();
    await shutdownUBots(ubotMains);
});