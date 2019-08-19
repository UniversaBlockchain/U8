import * as tk from "unit_tests/test_keys";
import * as db from "pg_driver";
import {expect, assert, unit} from 'test'

const io = require("io");
const UBotMain = require("ubot/ubot_main").UBotMain;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const cs = require("contractsservice");
const BigDecimal  = require("big").Big;
const Boss = require("boss");

const CONFIG_ROOT = io.getTmpDirPath() + "/ubot_config";

async function prepareConfigFiles(count) {
    await io.removeDir(CONFIG_ROOT);
    await io.createDir(CONFIG_ROOT);
    let keys = [];
    for (let i = 0; i < count; ++i)
        keys.push(tk.TestKeys.getKey());
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
    await prepareConfigFiles(count);
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

unit.test("ubot_main_test: hello ubot", async () => {
    const ubotsCount = 6;
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    ubotMains[4].debugSendUdp("hi all, ubot4 here");

    await sleep(1000);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_main_test: executeCloudMethod", async () => {
    const ubotsCount = 8;
    //await dropAllTables(8);
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(tk.TestKeys.getKey(), ubotMains[0].myInfo.publicKey, null);
    let userPrivKey = tk.TestKeys.getKey();

    let executableContract = Contract.fromPrivateKey(userPrivKey);
    executableContract.state.data.poolSize = 5;
    executableContract.state.data.poolQuorum = 4;
    executableContract.state.data.ubotAsm = "" +
        //"generateRandomHash;" + // should decline write to single storage, each ubot has random value
        "calc2x2;" + // should approve write to single storage, each ubot has same value
        "writeSingleStorage;" +
        "calc2x2;" +
        "writeMultiStorage;" +
        "finish";

    await executableContract.seal();

    let startingContract = Contract.fromPrivateKey(userPrivKey);
    startingContract.createTransactionalSection();
    startingContract.transactional.data.executableContract = await executableContract.getPackedTransaction();
    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id.digest;
    await startingContract.seal(true);

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
    });

    assert((await Boss.load(await event)).val === 4);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_main_test: errorOutput", async () => {
    const ubotsCount = 8;
    //await dropAllTables(8);
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:" + ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(tk.TestKeys.getKey(), ubotMains[0].myInfo.publicKey, null);
    let userPrivKey = tk.TestKeys.getKey();

    let executableContract = Contract.fromPrivateKey(userPrivKey);
    executableContract.state.data.poolSize = 5;
    executableContract.state.data.poolQuorum = 6;
    executableContract.state.data.ubotAsm = "" +
        //"generateRandomHash;" + // should decline write to single storage, each ubot has random value
        "calc2x2;" + // should approve write to single storage, each ubot has same value
        "writeSingleStorage;" +
        "finish";

    await executableContract.seal();

    let startingContract = Contract.fromPrivateKey(userPrivKey);
    startingContract.createTransactionalSection();
    startingContract.transactional.data.executableContract = await executableContract.getPackedTransaction();
    startingContract.state.data.methodName = "ubotAsm";
    startingContract.state.data.executableContractId = executableContract.id.digest;
    await startingContract.seal(true);

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
    });

    let errors = (await event).errors;
    assert(errors.length === 1);
    assert(errors[0].error === "FAILURE");
    assert(errors[0].objectName === "UBotAsmProcess_writeSingleStorage");
    assert(errors[0].message === "writing to single storage declined");

    await shutdownUBots(ubotMains);
});
