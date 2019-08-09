import {expect, assert, unit} from 'test'
import {PrivateKey, KeyAddress, HashId} from 'crypto'
import {randomBytes} from 'tools'
import {HttpClient} from 'web'
import {VerboseLevel} from "node_consts";
import * as io from 'io'
import * as tt from 'test_tools'
import * as tk from 'unit_tests/test_keys'

const Main = require("main").Main;
const Boss = require('boss.js');
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const ItemState = require("itemstate").ItemState;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const Constraint = require('constraint').Constraint;
const cs = require("contractsservice");

async function createMain(name, whiteKey, nolog, postfix = "") {

    let args = ["--test", "--config", "../test/config/test_node_config_v2" + postfix + "/" + name];
    if (nolog)
        args.push("--nolog");

    let main = await new Main(...args).run();

    main.config.uIssuerKeys.push(new KeyAddress("Zau3tT8YtDkj3UDBSznrWHAjbhhU4SXsfQLWDFsv5vw24TLn6s"));

    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/u_key.private.unikey"));
    main.config.addressesWhiteList.push(key.publicKey.longAddress);
    main.config.addressesWhiteList.push(whiteKey.publicKey.longAddress);

    return main;
}

class TestSpace {
    constructor(key) {
        this.myKey = key;
    }

    async create(nolog = true) {
        this.nodes = [];
        for (let i = 0; i < 4; i++)
            this.nodes.push(await createMain("node" + (i + 1), this.myKey, nolog));

        this.node = this.nodes[0];

        for (let i = 1; i < 4; i++)
            this.nodes[i].config.addressesWhiteList.push(this.node.nodeKey.publicKey.longAddress);

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
        await Promise.all(this.clients.map(async (c) => await c.stop()));
        await Promise.all(this.nodes.map(async (n) => await n.shutdown()));
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

    await main.ledger.saveContractInStorage(contract.id, await contract.getPackedTransaction(), contract.getExpiresAt(), contract.getOrigin(), 0);

    let packed = await contract.getPackedTransaction();

    httpClient.sendGetRequest("/contracts/" + contract.id.base64, (respCode, body) => {
        assert(respCode === 200);
        assert(packed.equals(body));

        fire[1]();
    });

    httpClient.sendGetRequest("/network", async (respCode, body) => {
        assert(respCode === 200);
        let result = await Boss.load(body);
        assert(result.result === "ok");

        assert(result.response.version === VERSION);
        assert(result.response.hasOwnProperty("number"));
        assert(result.response.hasOwnProperty("nodes"));

        fire[2]();
    });

    httpClient.sendGetRequest("/topology", async (respCode, body) => {
        assert(respCode === 200);
        let result = await Boss.load(body);
        assert(result.result === "ok");

        let data = await Boss.load(result.response.packed_data);
        assert(data.version === VERSION);
        assert(data.hasOwnProperty("number"));
        assert(data.hasOwnProperty("nodes"));

        let key = await ExtendedSignature.extractPublicKey(result.response.signature);
        assert(key != null);
        assert(await ExtendedSignature.verify(key, result.response.signature, result.response.packed_data) != null);

        fire[3]();
    });

    await Promise.all(events);

    await httpClient.stop();
    await main.shutdown();
});

unit.test("main_test: createTestSpace", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));
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

unit.test("main_test: sanitation", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        let it = 0;
        while (ts.nodes[i].node.isSanitating()) {
            if (it > 3000)
                break;

            await sleep(1);
            it++;
        }

        assert(it <= 3000);

        if (it > 0)
            await sleep(1000);
    }

    await ts.shutdown();
});

unit.test("main_test: resync", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

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

unit.test("main_test: resyncBreak", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(/*false*/);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let id = HashId.of(randomBytes(64));

    let record = await ts.nodes[1].ledger.findOrCreate(id);
    await record.decline();

    record = await ts.nodes[3].ledger.findOrCreate(id);
    await record.approve();

    assert(await ts.nodes[0].ledger.getRecord(id) == null);
    assert(await ts.nodes[2].ledger.getRecord(id) == null);

    let fire = null;
    let event = new Promise((resolve) => {fire = resolve});

    await ts.nodes[2].node.resync(id, () => fire(true));

    new ScheduleExecutor(() => fire(false), 10000).run();
    assert(await event);

    // resync breaked
    assert(await ts.nodes[2].ledger.getRecord(id) === null);

    await ts.shutdown();
});

const NOLOG = true;
const WAIT_TIMEOUT = 10000;

unit.test("main_test: register item", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let k = tk.TestKeys.getKey();
    let item = Contract.fromPrivateKey(k);

    await item.seal(true);

    await ts.node.node.registerItem(item);
    let ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.APPROVED);

    for (let i = 0; i < 4; i++) {
        ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        assert((await ts.nodes[i].ledger.getRecord(item.id)).state === ItemState.APPROVED);

        if (i !== 0) {
            ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
            assert(ir.state === ItemState.APPROVED);
        }
    }

    let fire = [];
    let events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {fire.push(resolve)}));

    for (let i = 0; i < 4; i++)
        await ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));

    (await Promise.all(events)).forEach(ir => {
        assert(ir != null);
        assert(ir.itemResult.state === ItemState.APPROVED);
    });

    await ts.shutdown();
});

unit.test("main_test: register item with sub-items", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let k = tk.TestKeys.getKey();
    let item = Contract.fromPrivateKey(k);

    for (let i = 0; i < 10; i++)
        item.newItems.add(Contract.fromPrivateKey(k));

    await item.seal(true);

    await ts.node.node.registerItem(item);
    let ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.APPROVED);

    for (let i = 0; i < 4; i++) {
        ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        assert((await ts.nodes[i].ledger.getRecord(item.id)).state === ItemState.APPROVED);

        if (i !== 0) {
            ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
            assert(ir.state === ItemState.APPROVED);
        }
    }

    let fire = [];
    let events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {fire.push(resolve)}));

    for (let i = 0; i < 4; i++)
        ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));

    (await Promise.all(events)).forEach(ir => {
        assert(ir != null);
        assert(ir.itemResult.state === ItemState.APPROVED);
    });

    for (let subItem of item.newItems) {
        for (let i = 0; i < 4; i++) {
            ir = await ts.nodes[i].node.waitItem(subItem.id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.APPROVED);

            assert((await ts.nodes[i].ledger.getRecord(subItem.id)).state === ItemState.APPROVED);

            if (i !== 0) {
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, subItem.id);
                assert(ir.state === ItemState.APPROVED);
            }
        }

        let fire = [];
        let events = [];
        for (let i = 0; i < 4; i++)
            events.push(new Promise((resolve) => {fire.push(resolve)}));

        for (let i = 0; i < 4; i++)
            ts.clients[i].command("getState", {itemId: subItem.id}, (result) => fire[i](result), () => fire[i](null));

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.APPROVED);
        });
    }

    await ts.shutdown();
});

unit.test("main_test: register bad item", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let k = tk.TestKeys.getKey();
    let item = Contract.fromPrivateKey(k);

    let cr = new Constraint(item);
    cr.type = Constraint.TYPE_EXISTING_DEFINITION;
    cr.name = "bad_constraint";
    let conditions = {};
    conditions[Constraint.conditionsModeType.all_of] = ["this.state.data.some_field defined"];
    cr.setConditions(conditions);
    item.addConstraint(cr);

    await item.seal(true);

    await ts.node.node.registerItem(item);
    let ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.DECLINED);

    for (let i = 0; i < 4; i++) {
        ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.DECLINED);

        assert((await ts.nodes[i].ledger.getRecord(item.id)).state === ItemState.DECLINED);

        if (i !== 0) {
            ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
            assert(ir.state === ItemState.DECLINED);
        }
    }

    let fire = [];
    let events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {fire.push(resolve)}));

    for (let i = 0; i < 4; i++)
        await ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));

    (await Promise.all(events)).forEach(ir => {
        assert(ir != null);
        assert(ir.itemResult.state === ItemState.DECLINED);
    });

    await ts.shutdown();
});

unit.test("main_test: register parcel", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let ownerKey = tk.TestKeys.getKey();
    let k = tk.TestKeys.getKey();

    //for (let it = 0; it < 50; it++) {
    //    console.log("Iteration = " + it);
        let U = await tt.createFreshU(100000000, [ownerKey.publicKey]);

        await ts.node.node.registerItem(U);
        let ir = await ts.node.node.waitItem(U.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        let item = Contract.fromPrivateKey(k);

        await item.seal(true);

        let parcel = await cs.createParcel(item, U, 1, [ownerKey], false);

        await ts.node.node.registerParcel(parcel);
        await ts.node.node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
        ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);
        ir = await ts.node.node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        for (let i = 0; i < 4; i++) {
            await ts.nodes[i].node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
            ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.APPROVED);
            ir = await ts.nodes[i].node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.APPROVED);

            assert((await ts.nodes[i].ledger.getRecord(item.id)).state === ItemState.APPROVED);
            assert((await ts.nodes[i].ledger.getRecord(parcel.getPaymentContract().id)).state === ItemState.APPROVED);

            if (i !== 0) {
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
                assert(ir.state === ItemState.APPROVED);
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, parcel.getPaymentContract().id);
                assert(ir.state === ItemState.APPROVED);
            }
        }

        let fire = [];
        let events = [];
        for (let i = 0; i < 8; i++)
            events.push(new Promise((resolve) => {
                fire.push(resolve)
            }));

        for (let i = 0; i < 4; i++) {
            await ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i * 2](result), () => fire[i * 2](null));
            await ts.clients[i].command("getState", {itemId: parcel.getPaymentContract().id}, (result) => fire[i * 2 + 1](result), () => fire[i * 2 + 1](null));
        }

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.APPROVED);
        });
    //}

    await ts.shutdown();
});

unit.test("main_test: register parcel with bad payload", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let ownerKey = tk.TestKeys.getKey();
    let k = tk.TestKeys.getKey();

    //for (let it = 0; it < 50; it++) {
    //    console.log("Iteration = " + it);
        let U = await tt.createFreshU(100000000, [ownerKey.publicKey]);

        await ts.node.node.registerItem(U);
        let ir = await ts.node.node.waitItem(U.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        let item = Contract.fromPrivateKey(k);

        let cr = new Constraint(item);
        cr.type = Constraint.TYPE_EXISTING_DEFINITION;
        cr.name = "bad_constraint";
        let conditions = {};
        conditions[Constraint.conditionsModeType.all_of] = ["this.state.data.some_field defined"];
        cr.setConditions(conditions);
        item.addConstraint(cr);

        await item.seal(true);

        let parcel = await cs.createParcel(item, U, 1, [ownerKey], false);

        await ts.node.node.registerParcel(parcel);
        await ts.node.node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
        ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.DECLINED);
        ir = await ts.node.node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        for (let i = 0; i < 4; i++) {
            await ts.nodes[i].node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
            ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.DECLINED);
            ir = await ts.nodes[i].node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.APPROVED);

            assert((await ts.nodes[i].ledger.getRecord(item.id)).state === ItemState.DECLINED);
            assert((await ts.nodes[i].ledger.getRecord(parcel.getPaymentContract().id)).state === ItemState.APPROVED);

            if (i !== 0) {
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
                assert(ir.state === ItemState.DECLINED);
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, parcel.getPaymentContract().id);
                assert(ir.state === ItemState.APPROVED);
            }
        }

        let fire = [];
        let events = [];
        for (let i = 0; i < 4; i++)
            events.push(new Promise((resolve) => {
                fire.push(resolve)
            }));

        for (let i = 0; i < 4; i++) {
            await ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));
        }

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.DECLINED);
        });

        fire = [];
        events = [];
        for (let i = 0; i < 4; i++)
            events.push(new Promise((resolve) => {
                fire.push(resolve)
            }));

        for (let i = 0; i < 4; i++) {
            await ts.clients[i].command("getState", {itemId: parcel.getPaymentContract().id}, (result) => fire[i](result), () => fire[i](null));
        }

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.APPROVED);
        });
    //}

    await ts.shutdown();
});

unit.test("main_test: register parcel with bad payment", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let ownerKey = tk.TestKeys.getKey();
    let k = tk.TestKeys.getKey();

    //for (let it = 0; it < 50; it++) {
    //    console.log("Iteration = " + it);
        let U = await tt.createFreshU(100000000, [ownerKey.publicKey]);

        await ts.node.node.registerItem(U);
        let ir = await ts.node.node.waitItem(U.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        let item = Contract.fromPrivateKey(k);

        await item.seal(true);

        let parcel = await cs.createParcel(item, U, 1, [k], false);

        await ts.node.node.registerParcel(parcel);
        await ts.node.node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
        ir = await ts.node.node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.DECLINED);
        ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.UNDEFINED);

        for (let i = 0; i < 4; i++) {
            await ts.nodes[i].node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
            ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.UNDEFINED);
            ir = await ts.nodes[i].node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
            assert(ir.state === ItemState.DECLINED);

            assert(await ts.nodes[i].ledger.getRecord(item.id) == null);
            assert((await ts.nodes[i].ledger.getRecord(parcel.getPaymentContract().id)).state === ItemState.DECLINED);

            if (i !== 0) {
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
                assert(ir.state === ItemState.UNDEFINED);
                ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, parcel.getPaymentContract().id);
                assert(ir.state === ItemState.DECLINED);
            }
        }

        let fire = [];
        let events = [];
        for (let i = 0; i < 4; i++)
            events.push(new Promise((resolve) => {
                fire.push(resolve)
            }));

        for (let i = 0; i < 4; i++) {
            await ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));
        }

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.UNDEFINED);
        });

        fire = [];
        events = [];
        for (let i = 0; i < 4; i++)
            events.push(new Promise((resolve) => {
                fire.push(resolve)
            }));

        for (let i = 0; i < 4; i++) {
            await ts.clients[i].command("getState", {itemId: parcel.getPaymentContract().id}, (result) => fire[i](result), () => fire[i](null));
        }

        (await Promise.all(events)).forEach(ir => {
            assert(ir != null);
            assert(ir.itemResult.state === ItemState.DECLINED);
        });
    //}

    await ts.shutdown();
});

unit.test("main_test: node stats", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(NOLOG);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let ownerKey = tk.TestKeys.getKey();
    let k = tk.TestKeys.getKey();

    //for (let it = 0; it < 50; it++) {
    //    console.log("Iteration = " + it);
        let U = await tt.createFreshU(100000000, [ownerKey.publicKey]);

        await ts.node.node.registerItem(U);
        let ir = await ts.node.node.waitItem(U.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        let item = Contract.fromPrivateKey(k);

        await item.seal(true);

        let parcel = await cs.createParcel(item, U, 1, [ownerKey], false);

        let date = new Date();
        let UTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        let days = UTC.getDate();
        let month = UTC.getMonth();
        let formatted = (days < 10 ? "0": "") + days + "/" + (month + 1 < 10 ? "0": "") + (month + 1) + "/" + UTC.getFullYear();

        await ts.node.node.registerParcel(parcel);
        await ts.node.node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
        ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);
        ir = await ts.node.node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.APPROVED);

        for (let i = 0; i < 4; i++)
            await ts.nodes[i].node.waitParcel(parcel.hashId, WAIT_TIMEOUT);

        // collect and get stats
        await ts.node.node.nodeStats.collect(ts.node.node.ledger, ts.node.node.config);

        let fire = null;
        let event = new Promise(resolve => fire = resolve);

        await ts.client.command("getStats", {showDays: 2}, (result) => fire(result), () => fire(null));

        let firstResult = await event;
        assert(firstResult != null);
        assert(firstResult.payments.some(pay => pay.date === formatted));
    //}

    await ts.shutdown();
});

// for checking set waiting timeout of payload (maxWaitingItemOfParcel for payload only) near 0
/*unit.test("main_test: register parcel with expired payload", async () => {
    let key = new PrivateKey(await io.fileGetContentsAsBytes("../test/keys/reconfig_key.private.unikey"));

    let ts = await new TestSpace(key).create(true);

    for (let i = 0; i < 4; i++) {
        ts.nodes[i].setVerboseLevel(VerboseLevel.DETAILED);
        ts.nodes[i].setUDPVerboseLevel(VerboseLevel.DETAILED);
    }

    let ownerKey = tk.TestKeys.getKey();
    let k = tk.TestKeys.getKey();

    let U = await tt.createFreshU(100000000, [ownerKey.publicKey]);

    await ts.node.node.registerItem(U);
    let ir = await ts.node.node.waitItem(U.id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.APPROVED);

    let item = Contract.fromPrivateKey(k);

    await item.seal(true);

    let parcel = await cs.createParcel(item, U, 1, [ownerKey], false);

    await ts.node.node.registerParcel(parcel);
    await ts.node.node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
    ir = await ts.node.node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.DECLINED);
    ir = await ts.node.node.waitItem(item.id, WAIT_TIMEOUT);
    assert(ir.state === ItemState.UNDEFINED);

    for (let i = 0; i < 4; i++) {
        await ts.nodes[i].node.waitParcel(parcel.hashId, WAIT_TIMEOUT);
        ir = await ts.nodes[i].node.waitItem(item.id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.UNDEFINED);
        ir = await ts.nodes[i].node.waitItem(parcel.getPaymentContract().id, WAIT_TIMEOUT);
        assert(ir.state === ItemState.DECLINED);

        assert(await ts.nodes[i].ledger.getRecord(item.id) == null);
        assert((await ts.nodes[i].ledger.getRecord(parcel.getPaymentContract().id)).state === ItemState.DECLINED);

        if (i !== 0) {
            ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, item.id);
            assert(ir.state === ItemState.UNDEFINED);
            ir = await ts.nodes[0].node.network.getItemState(ts.nodes[i].node.myInfo, parcel.getPaymentContract().id);
            assert(ir.state === ItemState.DECLINED);
        }
    }

    let fire = [];
    let events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {
            fire.push(resolve)
        }));

    for (let i = 0; i < 4; i++) {
        ts.clients[i].command("getState", {itemId: item.id}, (result) => fire[i](result), () => fire[i](null));
    }

    (await Promise.all(events)).forEach(ir => {
        assert(ir != null);
        assert(ir.itemResult.state === ItemState.UNDEFINED);
    });

    fire = [];
    events = [];
    for (let i = 0; i < 4; i++)
        events.push(new Promise((resolve) => {
            fire.push(resolve)
        }));

    for (let i = 0; i < 4; i++) {
        ts.clients[i].command("getState", {itemId: parcel.getPaymentContract().id}, (result) => fire[i](result), () => fire[i](null));
    }

    (await Promise.all(events)).forEach(ir => {
        assert(ir != null);
        assert(ir.itemResult.state === ItemState.DECLINED);
    });

    await ts.shutdown();
});*/

// BENCHMARKS

/*unit.test("main_test: simpleBenchmark", async () => {
    let key = new PrivateKey(await (await io.openRead("../test/keys/reconfig_key.private.unikey")).allBytes());
    let ts = await new TestSpace(key).create();

    let k = tk.TestKeys.getKey();
    let start = new Date().getTime();

    for (let i = 0; i < 100; i++) {
        console.log("iteration " + i);
        let item = Contract.fromPrivateKey(k);
        item.state.data.val = i;

        await item.seal(true);

        await ts.node.node.registerItem(item);
        let ir = await ts.node.node.waitItem(item.id, 8000);
        assert(ir.state === ItemState.APPROVED);
    }

    let finish = new Date().getTime();
    let time = finish - start;

    console.log("result " + time + " ms");
    //31795
    //31728
    //33660
    //34045
    //29309

    await ts.shutdown();
});

unit.test("main_test: parallelBenchmark", async () => {
    let key = new PrivateKey(await (await io.openRead("../test/keys/reconfig_key.private.unikey")).allBytes());
    let ts = await new TestSpace(key).create();

    let promises = [];

    let k = tk.TestKeys.getKey();
    let start = new Date().getTime();

    for (let i = 0; i < 100; i++) {
        console.log("iteration " + i);
        let item = Contract.fromPrivateKey(k);
        item.state.data.val = i;

        await item.seal(true);

        await ts.node.node.registerItem(item);
        promises.push(ts.node.node.waitItem(item.id, 10000));
    }

    let res = (await Promise.all(promises)).every(ir => ir.state === ItemState.APPROVED);
    assert(res);

    let finish = new Date().getTime();
    let time = finish - start;

    console.log("result " + time + " ms");
    //13477
    //12367
    //16558
    //10810
    //10525

    await ts.shutdown();
});*/