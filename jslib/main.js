import * as io from 'io'
import {PrivateKey, KeyAddress} from 'crypto'
import {NodeInfo, NetConfig} from 'web'
import * as t from 'tools'

const NODE_VERSION = VERSION;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const OptionParser = require("optionparser").OptionParser;
const ClientHTTPServer = require("client_http_server").ClientHTTPServer;
const Config = require("config").Config;
const Ledger = require("ledger").Ledger;
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

        if (this.parser.values.has("config")) {
            await this.loadNodeConfig();
            await this.loadNetConfig();

        } else if (this.parser.values.has("database")) {

        } else if (this.parser.values.has("restart-socket")) {
            this.restartUDPAdapter();

        } else if (this.parser.values.has("shutdown")) {
            await this.shutdown();

        } else {
            console.error("Neither config no database option passed, leaving");
            return;
        }

        if (this.parser.values.has("verbose")) {

        }

        if (this.parser.values.has("udp-verbose")) {

        }

        //startClientHttpServer();

        //startNode();

        return this;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["c", "config"], "configuration file for the network", true, "config_file")
            .option(["d", "database"], "database connection url", true, "db_url")
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

        console.log("node settings: " + JSON.stringify(settings, null, 2));

        let nodeKeyFileName = this.configRoot + "/tmp/" + settings.node_name + ".private.unikey";
        console.log(nodeKeyFileName);

        this.nodeKey = new PrivateKey(await (await io.openRead(nodeKeyFileName)).allBytes());

        this.myInfo = NodeInfo.withParameters(this.nodeKey.publicKey,
            t.getOrThrow(settings, "node_number"),
            t.getOrThrow(settings, "node_name"),
            t.getOrThrow(settings, "ip")[0],
            settings.hasOwnProperty("ipv6") ? settings.ipv6[0] : null,
            t.getOrThrow(settings, "public_host"),
            t.getOrThrow(settings, "udp_server_port"),
            t.getOrThrow(settings, "http_client_port"),
            t.getOrThrow(settings, "http_server_port"));

        this.config.isFreeRegistrationsAllowedFromYaml = t.getOrDefault(settingsShared, "allow_free_registrations", false);
        this.config.permanetMode = t.getOrDefault(settingsShared, "permanet_mode", false);

        if (settingsShared.hasOwnProperty("whitelist")) {
            for(let value of settingsShared.whitelist) {
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
        console.log("ledger constructed");

        console.log("key loaded: " + this.nodeKey.toString());
        console.log("node local URL: " + this.myInfo.serverUrlString());
        console.log("node public URL: " + this.myInfo.publicUrlString());
    }

    async loadNetConfig() {
        this.netConfig = await NetConfig.loadByPath(this.configRoot + "/config/nodes");
        console.log("Network configuration is loaded from " + this.configRoot + ", " + this.netConfig.size + " nodes.");
    }

    startClientHttpServer() {
        /*console.log("prepare to start client HTTP server on " + this.myInfo.clientAddress.port);

        this.clientHTTPServer = new ClientHTTPServer(this.nodeKey, this.myInfo.clientAddress.port, this.logger);
        this.clientHTTPServer.cache = cache;
        this.clientHTTPServer.parcelCache = parcelCache;
        this.clientHTTPServer.netConfig = netConfig;*/
//        node = new Node()
    }

    restartUDPAdapter() {

    }

    async shutdown() {
        await this.ledger.close();
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Main, NODE_VERSION};