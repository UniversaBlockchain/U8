import * as io from 'io'
import {PrivateKey, KeyAddress} from 'crypto'
import {NodeInfo, NetConfig} from 'web'
import * as t from 'tools'

const NODE_VERSION = VERSION;
const OptionParser = require("optionparser").OptionParser;
const Logger = require("logger").Logger;
const ClientHTTPServer = require("client_http_server").ClientHTTPServer;
const Config = require("config").Config;
const Ledger = require("ledger").Ledger;
const Node = require("node").Node;
const NetworkV2 = require("net").NetworkV2;
const yaml = require('yaml');

async function main(...args) {
    await new Main(...args).run();
}

class Main {

    static NAME_STRING = "Universa node server v" + NODE_VERSION + "\n";

    constructor(...args) {
        this.nodeKey = null;
        this.configRoot = null;
        this.netConfig = null;
        this.network = null;
        this.myInfo = null;
        this.clientHTTPServer = null;
        this.node = null;
        this.config = new Config();
        this.logger = new Logger(4096);
        this.node = null;

        this.parser = Main.initOptionParser();
        this.parser.parse(args);
    }

    async run() {
        if (this.parser.options.has("version")) {
            console.log("Version " + NODE_VERSION);
            return this;
        }

        if (this.parser.options.has("?")) {
            console.log("usage called\n");
            console.log(Main.NAME_STRING);
            console.log(this.parser.help());
            return this;
        }

        if (this.parser.options.has("nolog"))
            this.logger.nolog = true;

        if (this.parser.values.has("config")) {
            await this.loadNodeConfig();
            await this.loadNetConfig();

        } else if (this.parser.values.has("restart-socket")) {
            this.restartUDPAdapter();

        } else if (this.parser.values.has("shutdown")) {
            await this.shutdown();

        } else {
            console.error("Neither config no database option passed, leaving");
            return;
        }

        this.logger.log("Starting the client HTTP server...");
        this.startClientHttpServer();

        this.logger.log("Starting the Universa node service...");
        await this.startNode();

        if (this.parser.values.has("verbose"))
            this.setVerboseLevel(this.parser.values.get("verbose"));

        if (this.parser.values.has("udp-verbose"))
            this.setUDPVerboseLevel(this.parser.values.get("udp-verbose"));

        return this;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["c", "config"], "configuration file for the network", true, "config_file")
            //.option(["d", "database"], "database connection url", true, "db_url")
            .option(["test"], "intended to be used in integration tests")
            .option(["nolog"], "do not buffer log messages (good for testing)")
            .option(["verbose"], "sets verbose level to nothing, base or detail", true, "level")
            .option(["udp-verbose"], "sets udp-verbose level to nothing, base or detail", true, "level")
            .option(["restart-socket"], "restarts UDPAdapter: shutdown it and create new")
            .option(["shutdown"], "delicate shutdown with rollback current processing contracts")
            .option(["version"], "show version");

        return parser;
    }

    async loadNodeConfig() {
        this.configRoot = this.parser.values.get("config");

        let settings = yaml.load(await (await io.openRead(this.configRoot + "/config/config.yaml")).allAsString());

        let settingsShared;
        if (await io.isAccessible(this.configRoot + "/config/shared.yaml"))
            settingsShared = yaml.load(await (await io.openRead(this.configRoot + "/config/shared.yaml")).allAsString());
        else
            settingsShared = settings;

        this.logger.log("node settings: " + JSON.stringify(settings, null, 2));

        let nodeName = t.getOrThrow(settings, "node_name");
        let nodeKeyFileName = this.configRoot + "/tmp/" + nodeName + ".private.unikey";
        this.logger.log(nodeKeyFileName);

        this.nodeKey = new PrivateKey(await (await io.openRead(nodeKeyFileName)).allBytes());

        this.myInfo = NodeInfo.withParameters(this.nodeKey.publicKey,
            t.getOrThrow(settings, "node_number"),
            nodeName,
            t.getOrThrow(settings, "ip")[0],
            settings.hasOwnProperty("ipv6") ? settings.ipv6[0] : null,
            t.getOrThrow(settings, "public_host"),
            t.getOrThrow(settings, "udp_server_port"),
            t.getOrThrow(settings, "http_client_port"),
            t.getOrThrow(settings, "http_public_port"));

        this.config.isFreeRegistrationsAllowedFromYaml = t.getOrDefault(settingsShared, "allow_free_registrations", false);
        this.config.permanetMode = t.getOrDefault(settingsShared, "permanet_mode", false);
        this.config.main = this;

        if (settingsShared.hasOwnProperty("whitelist")) {
            for (let value of settingsShared.whitelist) {
                try {
                    this.config.addressesWhiteList.push(new KeyAddress(value));
                } catch (err) {
                    console.error(err.message);
                    if (err.stack != null)
                        console.error(err.stack);
                }
            }
        }

        this.ledger = new Ledger(t.getOrThrow(settings, "database"));
        this.logger.log("ledger constructed");

        this.logger.log("key loaded: " + this.nodeKey.toString());
        this.logger.log("node local URL: " + this.myInfo.serverUrlString());
        this.logger.log("node public URL: " + this.myInfo.publicUrlString());
    }

    async loadNetConfig() {
        this.netConfig = await NetConfig.loadByPath(this.configRoot + "/config/nodes");
        this.logger.log("Network configuration is loaded from " + this.configRoot + ", " + this.netConfig.size + " nodes.");
    }

    startClientHttpServer() {
        this.logger.log("prepare to start client HTTP server on " + this.myInfo.clientAddress.port);

        this.clientHTTPServer = new ClientHTTPServer(this.nodeKey, this.myInfo.clientAddress.port, this.logger);
        this.clientHTTPServer.netConfig = this.netConfig;
        this.clientHTTPServer.config = this.config;
        this.clientHTTPServer.localCors = this.myInfo.publicHost === "localhost";
    }

    async startNode() {
        this.network = new NetworkV2(this.netConfig, this.myInfo, this.nodeKey, this.logger);
        this.node = await new Node(this.config, this.myInfo, this.ledger, this.network, this.nodeKey, this.logger).run();
        this.cache = this.node.cache;
        //this.parcelCache = this.node.parcelCache;

        this.clientHTTPServer.node = this.node;
        this.clientHTTPServer.cache = this.cache;
        this.clientHTTPServer.parcelCache = this.parcelCache;
    }

    setVerboseLevel(level) {
        this.network.verboseLevel = level;
        this.node.verboseLevel = level;
    }

    setUDPVerboseLevel(level) {
        if (this.network.adapter != null)
            this.network.adapter.verboseLevel = level;
    }

    restartUDPAdapter() {
        this.network.restartUDPAdapter();
    }

    async shutdown() {
        if (this.ledger != null)
            await this.ledger.close();

        if (this.network != null)
            this.network.shutdown();

        if (this.node != null)
            this.node.shutdown();

        if (this.clientHTTPServer != null)
            this.clientHTTPServer.shutdown();
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Main, NODE_VERSION};