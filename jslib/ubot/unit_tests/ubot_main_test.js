/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as tk from "unit_tests/test_keys";
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

unit.test("ubot_main_test: hello ubot", async () => {
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    ubotMains[4].debugSendUdp("hi all, ubot4 here");

    await sleep(1000);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_main_test: JS secureRandom", async () => {
    //for (let i = 0; i < 50; i++) {
    //console.log("\nIteration test № ", i);
    let ubotMains = await createUBots(ubotsCount);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url);
    await client.start(clientKey, ubotMains[0].myInfo.publicKey, null);

    let executableContract = Contract.fromPrivateKey(userPrivKey);

    executableContract.state.data.cloud_methods = {
        getRandom: {
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
            throw new Error("Hash of hashes does not match the previously saved");

        let randomHash = crypto.HashId.of(rands.join());
        let bigRandom = new BigDecimal(0);
        randomHash.digest.forEach(byte => bigRandom = bigRandom.mul(256).add(byte));
        
        let result = Number.parseInt(bigRandom.mod(max).toFixed());

        await writeSingleStorage({hashesHash: hashesHash, result: result});

        return result;
    }
    `;

    await executableContract.seal();

    let startingContract = Contract.fromPrivateKey(userPrivKey);
    startingContract.state.data.methodName = "getRandom";
    startingContract.state.data.methodArgs = [1000];
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

    let random = await event;
    // checking secure random value
    assert(typeof random === "number" && random >= 0 && random < 1000);

    await client.stop();
    await shutdownUBots(ubotMains);//}
});