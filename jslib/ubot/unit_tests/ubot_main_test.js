import * as tk from "unit_tests/test_keys";
let io = require("io");
const UBotMain = require("ubot/ubot_main").UBotMain;
const cs = require("contractsservice");
const BigDecimal  = require("big").Big;

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
        yamlStr += "database: jdbc:postgresql://localhost:5432/universa_ubot_t"+i+"\n";
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

    let ubotMain = new UBotMain(...args);
    await ubotMain.start();

    return ubotMain;
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
    const count = 6;
    let ubotMains = await createUBots(count);

    console.log("\ntest send...");
    ubotMains[4].debugSendUdp("hi all, ubot4 here");

    await sleep(1000);

    await shutdownUBots(ubotMains);
});

unit.test("ubot_main_test: execJS", async () => {
    const count = 8;
    let ubotMains = await createUBots(count);

    console.log("\ntest send...");
    let url = "http://localhost:"+ubotMains[0].myInfo.clientAddress.port;
    let client = new network.HttpClient(url, 20, 20);
    await client.start(tk.TestKeys.getKey(), ubotMains[0].myInfo.publicKey, null);
    let userPrivKey = tk.TestKeys.getKey();
    let contract = await cs.createTokenContract([userPrivKey], [userPrivKey.publicKey], new BigDecimal("100"));
    contract.state.data.poolSize = 3;
    await contract.seal();
    let contractBin = contract.getPackedTransaction();
    client.command("executeCloudMethod", {contract: contractBin}, resp=>{
        console.log("resp: " + JSON.stringify(resp));
    }, err=>{
        console.log("err: " + err);
    });

    await sleep(1000);

    await shutdownUBots(ubotMains);
});

// unit.test("ubot_main_test: recreate http servers", async () => {
//     console.log();
//
//     for (let kkk = 0; kkk < 1000; ++kkk) {
//
//         console.log("kkk = " + kkk);
//
//         let privKey = tk.TestKeys.getKey();
//         const count = 200;
//         let servers = [];
//         for (let i = 0; i < count; ++i) {
//             let s = new network.HttpServer("127.0.0.1", 10000 + i, 20, 20);
//             s.initSecureProtocol(privKey);
//             s.addSecureEndpoint("someSecureCmd", (params, clientKey) => {
//                 console.log("!!! server someSecureCmd received !!!");
//                 return {};
//             });
//             s.startServer();
//             servers.push(s);
//         }
//         let url = "http://127.0.0.1:" + (10000 + count - 1);
//         let client = new network.HttpClient(url, 64, 64);
//         console.log("start client... url: " + url);
//         await client.start(tk.TestKeys.getKey(), privKey.publicKey, null);
//
//         console.log("send command...");
//         client.command("someSecureCmd", {}, resp => {
//             console.log("!!! resp: " + JSON.stringify(resp) + " !!!");
//         }, err => {
//             console.log("err: " + err);
//         });
//
//         console.log("sleep...");
//         await sleep(2000);
//         console.log("exit...");
//
//         let stopPromises = [];
//         for (let i = 0; i < servers.length; ++i)
//             stopPromises.push(servers[i].stopServer());
//         stopPromises.push(client.stop());
//         await Promise.all(stopPromises);
//
//     }
// });
