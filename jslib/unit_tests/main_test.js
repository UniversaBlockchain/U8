import {expect, assert, unit} from 'test'
import {PrivateKey, KeyAddress, HashId} from 'crypto'
import {randomBytes} from 'tools'
import {HttpClient} from 'web'
import {VerboseLevel} from "node_consts";
import * as io from 'io'
import * as tk from 'unit_tests/test_keys'

const Main = require("main").Main;
const Boss = require('boss.js');
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const ItemState = require("itemstate").ItemState;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;

async function createMain(name, nolog, postfix = "") {

    let args = ["--test", "--config", "../test/config/test_node_config_v2" + postfix + "/" + name];
    if (nolog)
        args.push("--nolog");

    let main = await new Main(...args).run();

    main.config.uIssuerKeys.push(new KeyAddress("Zau3tT8YtDkj3UDBSznrWHAjbhhU4SXsfQLWDFsv5vw24TLn6s"));

    let key = new PrivateKey(await (await io.openRead("../test/keys/u_key.private.unikey")).allBytes());
    main.config.addressesWhiteList.push(key.publicKey.longAddress);

    return main;
}

class TestSpace {
    constructor(key) {
        this.myKey = key;
    }

    async create(nolog = true) {
        this.nodes = [];
        for (let i = 0; i < 4; i++)
            this.nodes.push(await createMain("node" + (i + 1), nolog));

        this.node = this.nodes[0];

        this.clients = [];
        for (let i = 0; i < 4; i++) {
            let client = new HttpClient(this.nodes[i].myInfo.publicUrlString(), 4, 256);
            await client.start(this.myKey, this.nodes[i].myInfo.publicKey);
            this.clients.push(client);
        }
        this.client = this.clients[0];

        return this;
    };

    async shutdown() {
        await Promise.all(this.nodes.map(n => n.shutdown()));
    }
}

unit.test("main_test: checkOptionParsing", () => {
    let parser = Main.initOptionParser();
    parser.parse(["-h"]);

    assert(parser.options.has("?"));
    assert(parser.options.has("h"));
    assert(parser.options.has("help"));

    parser = Main.initOptionParser();
    parser.parse(["--test", "-c", "./path/config"]);

    assert(parser.options.has("test"));
    assert(parser.options.has("c"));
    assert(parser.options.has("config"));

    assert(!parser.values.has("test"));
    assert(parser.values.get("c") === "./path/config");
    assert(parser.values.get("config") === "./path/config");

    parser = Main.initOptionParser();
    parser.parse(["--config", "/full/path/test config", "-version"]);

    assert(parser.options.has("version"));
    assert(parser.options.has("c"));
    assert(parser.options.has("config"));

    assert(!parser.values.has("version"));
    assert(parser.values.get("c") === "/full/path/test config");
    assert(parser.values.get("config") === "/full/path/test config");

    parser = Main.initOptionParser();
    parser.parse(["--config", "./path/config2", "--test", "-verbose", "nothing", "-nolog", "--udp-verbose", "nothing", "--version"]);

    assert(parser.options.has("c"));
    assert(parser.options.has("config"));
    assert(parser.options.has("test"));
    assert(parser.options.has("verbose"));
    assert(parser.options.has("nolog"));
    assert(parser.options.has("udp-verbose"));
    assert(parser.options.has("version"));

    assert(!parser.values.has("test"));
    assert(!parser.values.has("nolog"));
    assert(!parser.values.has("version"));
    assert(parser.values.get("c") === "./path/config2");
    assert(parser.values.get("config") === "./path/config2");
    assert(parser.values.get("verbose") === "nothing");
    assert(parser.values.get("udp-verbose") === "nothing");
});

unit.test("main_test: checkVersionAndHelp", async () => {
    let main = await new Main("--version").run();

    //main = new Main("-?");
    let help = main.parser.help();

    //console.log(help);
    assert(help.includes("-?, -h, -help             show help"));
    assert(help.includes("-c, -config <config_file> configuration file for the network"));
    assert(help.includes("-test                     intended to be used in integration tests"));
    assert(help.includes("-nolog                    do not buffer log messages (good for testing)"));
    assert(help.includes("-verbose <level>          sets verbose level to nothing, base or detail"));
    assert(help.includes("-udp-verbose <level>      sets udp-verbose level to nothing, base or detail"));
    assert(help.includes("-restart-socket           restarts UDPAdapter: shutdown it and create new"));
    assert(help.includes("-shutdown                 delicate shutdown with rollback current processing contracts"));
    assert(help.includes("-version                  show version"));

    await main.shutdown();
});

unit.test("main_test: startNode", async () => {
    let main = await new Main("--test", "--config", "../test/config/test_node_config_v2/node1", "--nolog").run();

    await main.shutdown();

    assert(main.logger.buffer.includes("ledger constructed"));
    assert(main.logger.buffer.includes("key loaded: " + main.nodeKey.toString()));
    assert(main.logger.buffer.includes("node local URL: " + main.myInfo.serverUrlString()));
    assert(main.logger.buffer.includes("node public URL: " + main.myInfo.publicUrlString()));
    assert(main.logger.buffer.includes("Network configuration is loaded from " + main.configRoot + ", " + main.netConfig.size + " nodes."));
    assert(main.logger.buffer.includes("Starting the client HTTP server..."));
    assert(main.logger.buffer.includes("prepare to start client HTTP server on " + main.myInfo.clientAddress.port));
    assert(main.logger.buffer.includes("Starting the Universa node service..."));
    assert(main.logger.buffer.includes("1: Network consensus is set to (negative/positive/resyncBreak): 2 / 3 / 2"));
});

unit.test("main_test: sendHttpRequests", async () => {
    let main = await new Main("--test", "--config", "../test/config/test_node_config_v2/node1", "--nolog").run();

    let httpClient = new HttpClient("localhost:" + main.myInfo.clientAddress.port, 4, 4096);

    let fire = [];
    let events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {fire.push(resolve)}));

    httpClient.sendGetRequest("/contracts/" + HashId.of(randomBytes(64)).base64, (respCode, body) => {
        assert(respCode === 404);

        fire[0]();
    });

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    await main.ledger.saveContractInStorage(contract.id, contract.getPackedTransaction(), contract.getExpiresAt(), contract.getOrigin(), 0);

    httpClient.sendGetRequest("/contracts/" + contract.id.base64, (respCode, body) => {
        assert(respCode === 200);
        assert(contract.getPackedTransaction().equals(body));

        fire[1]();
    });

    httpClient.sendGetRequest("/network", (respCode, body) => {
        assert(respCode === 200);
        let result = Boss.load(body);
        assert(result.result === "ok");

        assert(result.response.version === VERSION);
        assert(result.response.hasOwnProperty("number"));
        assert(result.response.hasOwnProperty("nodes"));

        fire[2]();
    });

    httpClient.sendGetRequest("/topology", async (respCode, body) => {
        assert(respCode === 200);
        let result = Boss.load(body);
        assert(result.result === "ok");

        let data = Boss.load(result.response.packed_data);
        assert(data.version === VERSION);
        assert(data.hasOwnProperty("number"));
        assert(data.hasOwnProperty("nodes"));

        let key = ExtendedSignature.extractPublicKey(result.response.signature);
        assert(key != null);
        assert(await ExtendedSignature.verify(key, result.response.signature, result.response.packed_data) != null);

        fire[3]();
    });

    await Promise.all(events);

    await main.shutdown();
});

unit.test("main_test: createTestSpace", async () => {
    let key = new PrivateKey(await (await io.openRead("../test/keys/reconfig_key.private.unikey")).allBytes());
    let ts = await new TestSpace(key).create();

    for (let i = 0; i < 4; i++) {
        assert(ts.nodes[i].logger.buffer.includes("ledger constructed"));
        assert(ts.nodes[i].logger.buffer.includes("key loaded: " + ts.nodes[i].nodeKey.toString()));
        assert(ts.nodes[i].logger.buffer.includes("node local URL: " + ts.nodes[i].myInfo.serverUrlString()));
        assert(ts.nodes[i].logger.buffer.includes("node public URL: " + ts.nodes[i].myInfo.publicUrlString()));
        assert(ts.nodes[i].logger.buffer.includes("Network configuration is loaded from " + ts.nodes[i].configRoot + ", " + ts.nodes[i].netConfig.size + " nodes."));
        assert(ts.nodes[i].logger.buffer.includes("Starting the client HTTP server..."));
        assert(ts.nodes[i].logger.buffer.includes("prepare to start client HTTP server on " + ts.nodes[i].myInfo.clientAddress.port));
        assert(ts.nodes[i].logger.buffer.includes("Starting the Universa node service..."));
        assert(ts.nodes[i].logger.buffer.includes(ts.nodes[i].myInfo.number + ": Network consensus is set to (negative/positive/resyncBreak): 2 / 3 / 2"));
    }

    await ts.shutdown();
});

unit.test("main_test: resync", async () => {
    let key = new PrivateKey(await (await io.openRead("../test/keys/reconfig_key.private.unikey")).allBytes());
    let ts = await new TestSpace(key).create(/*false*/);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let id = HashId.of(randomBytes(64));

    let createdAtSumm = 0;
    let expiresAtSumm = 0;
    for (let i = 0; i < 4; i++)
        if (i !== 1) {
            let record = await ts.nodes[i].ledger.findOrCreate(id);
            createdAtSumm += Math.floor(record.createdAt.getTime() / 1000);
            expiresAtSumm += Math.floor(record.expiresAt.getTime() / 1000);
            await record.approve();
        }

    assert(await ts.nodes[1].ledger.getRecord(id) == null);

    let fire = null;
    let event = new Promise((resolve) => {fire = resolve});

    await ts.nodes[1].node.resync(id, () => fire(true));

    new ScheduleExecutor(() => fire(false), 10000).run();
    assert(await event);

    let rec = await ts.nodes[1].ledger.getRecord(id);
    assert(rec.state === ItemState.APPROVED);

    assert(Math.floor(createdAtSumm / 3) * 1000 === rec.createdAt.getTime());
    assert(Math.floor(expiresAtSumm / 3) * 1000 === rec.expiresAt.getTime());

    await ts.shutdown();
});