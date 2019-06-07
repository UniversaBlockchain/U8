import {expect, assert, unit} from 'test'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'
import {HttpClient} from 'web'
import * as tk from 'unit_tests/test_keys'

const Main = require("main").Main;
const Boss = require('boss.js');
const ExtendedSignature = require("extendedsignature").ExtendedSignature;

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
    assert(main.logger.buffer.includes("prepare to start client HTTP server on 8080"));
    assert(main.logger.buffer.includes("Starting the Universa node service..."));
    assert(main.logger.buffer.includes("1: Network consensus is set to (negative/positive/resyncBreak): 2 / 3 / 2"));
});

unit.test("main_test: sendHttpRequests", async () => {
    let main = await new Main("--test", "--config", "../test/config/test_node_config_v2/node1", "--nolog").run();

    let httpClient = new HttpClient("localhost:" + main.myInfo.clientAddress.port, 32, 4096);

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