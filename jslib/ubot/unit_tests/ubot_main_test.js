import * as tk from "unit_tests/test_keys";
let io = require("io");
const UBotMain = require("ubot/ubot_main").UBotMain;

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
        yamlStr += "http_server_port: "+(17000+i)+"\n";
        yamlStr += "udp_server_port: "+(16000+i)+"\n";
        yamlStr += "database: jdbc:postgresql://localhost:5432/universa_ubot_t"+i+"\n";
        yamlStr += "ubot_number: "+i+"\n";
        yamlStr += "public_host: localhost\n";
        yamlStr += "ubot_name: "+ubotName+"\n";
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
            let otherUbotConfigDir = ubotConfigDir + "/config/ubots";
            await io.createDir(otherUbotConfigDir);
            let otherUbotPubKeyPath = otherUbotPubKeyDir+"/"+otherUbotName+".public.unikey";
            let otherUbotConfigPath = otherUbotConfigDir+"/"+otherUbotName+".yaml";
            await io.filePutContents(otherUbotPubKeyPath, keys[j].publicKey.packed);
            await io.filePutContents(otherUbotConfigPath, configs[j]);
        }
    }
}

async function createUbotMain(nolog) {
    let args = [];
    if (nolog)
        args.push("--nolog");

    let ubotMain = new UBotMain(...args);
    await ubotMain.start();

    return ubotMain;
}

unit.test("ubot_main_test: hello ubot", async () => {
    console.log("hello ubot test");
    await prepareConfigFiles(10);
    // let tmpPath = io.getTmpDirPath();
    // await io.removeDir(tmpPath + "/cfg1");
    // await io.createDir(tmpPath + "/cfg1");
    // await io.createDir(tmpPath + "/cfg1/dir14");
    // await io.createDir(tmpPath + "/cfg1/dir15");
    // await io.createDir(tmpPath + "/cfg1/dir16");
    // await io.createDir(tmpPath + "/cfg1/dir15/someshit");
    let ubm = await createUbotMain(false);
    await ubm.shutdown();
});