/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
import * as db from "pg_driver";
import {expect, assert, unit} from 'test'

const io = require("io");
const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const Errors = require("errors").Errors;
const Boss = require("boss");
const cs = require("contractsservice");
const Constraint = require('constraint').Constraint;

const CONFIG_ROOT = "../test/config/ubot_config"; //io.getTmpDirPath() + "/ubot_config";
const clientKey = tk.TestKeys.getKey();
const userPrivKey = tk.TestKeys.getKey();

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

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    assert((await Boss.load(await event)).val === 4);

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: generateRandomHash", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    // checking length of random hash
    assert((await event).length === 96);

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: errorOutput", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:" + ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FAILED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    let errors = (await event).errors;
    assert(errors.length === 1);
    assert(errors[0].error === Errors.FAILURE);
    assert(errors[0].objectName === "UBotProcess_writeSingleStorage");
    assert(errors[0].message === "writing to single storage declined");

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: multi-verify method", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "main";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    // checking length of random hash
    assert((await event).length === 96);

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: multi-verify method failed", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "main";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FAILED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    let errors = (await event).errors;
    assert(errors.length === 1);
    assert(errors[0].error === Errors.FAILURE);
    assert(errors[0].objectName === "UBotProcess_writeMultiStorage");
    assert(errors[0].message === "failed self result verification");

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: call sub-method", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "main";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    assert((await Boss.load(await event)).val === 4);

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: secureRandom", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "getRandom";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    // checking length of random hash
    assert((await event).length === 96);

    await client.stop();
    await shutdownUBots(ubotMains);
});

unit.test("ubot_commands_test: getDataByRecordId", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

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

    let startingContract = Contract.fromPrivateKey(userPrivKey);

    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id;

    await cs.addConstraintToContract(startingContract, executableContract, "executableContractConstraint",
        Constraint.TYPE_EXISTING_STATE, ["this.state.data.executableContractId == ref.id"], true);

    console.log("executableContract.id: " + executableContract.id);
    console.log("startingContract.id: " + startingContract.id);

    let startingContractBin = await startingContract.getPackedTransaction();
    await client.command("executeCloudMethod", {contract: startingContractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    //waiting pool started...
    await sleep(1000);

    let pool = [];
    let proc = ubotMains[0].ubot.processors.get(startingContract.id.base64);

    for (let i = 0; i < proc.pool.length; i++)
        pool.push(proc.pool[i].number);

    //waiting pool finished...
    while (!pool.every(ubot => !ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state.canContinue))
        await sleep(100);

    assert(pool.every(ubot => ubotMains[ubot].ubot.processors.get(startingContract.id.base64).state === UBotPoolState.FINISHED));

    let fire = null;
    let event = new Promise(resolve => fire = resolve);

    await client.command("getState", {startingContractId: startingContract.id}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
        fire(resp.result);
    }, err=>{
        console.log("err: " + err);
        fire(null);
    });

    assert(await event);

    await client.stop();
    await shutdownUBots(ubotMains);
});