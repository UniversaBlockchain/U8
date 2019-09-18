/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {NetConfig, NodeInfo} from "web";
import * as io from "io";
import * as t from "tools";
import {KeyAddress, PrivateKey} from "crypto";

const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;
const UBotHttpServer = require("ubot/ubot_http_server").UBotHttpServer;
const UBotNetwork = require("ubot/ubot_network").UBotNetwork;
const UBotLedger = require("ubot/ubot_ledger").UBotLedger;
const UBot = require("ubot/ubot").UBot;
const yaml = require("yaml");
const UBotTestNotification = require("ubot/ubot_notification").UBotTestNotification;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotCloudNotification_process = require("ubot/ubot_notification").UBotCloudNotification_process;

const UBOT_VERSION = VERSION;

class UBotMain {

    static NAME_STRING = "Universa ubot server v" + UBOT_VERSION;

    constructor(...args) {
        this.logger = new Logger(4096);

        this.configRoot = null;
        this.netConfig = null;
        this.myInfo = null;
        this.settings = null;

        this.network = null;
        this.httpServer = null;
        this.ledger = null;
        this.ubot = null;

        this.parser = UBotMain.initOptionParser();
        this.parser.parse(args);
    }

    async start() {
        if (await this.processOptions())
            return;

        this.network = new UBotNetwork(this.netConfig, this.myInfo, this.nodeKey, this.logger);

        this.ledger = new UBotLedger(this.logger, t.getOrThrow(this.settings, "database"));
        await this.ledger.init();

        this.ubot = new UBot(this.logger, this.network, this.ledger);

        this.httpServer = new UBotHttpServer(this.nodeKey, "127.0.0.1", this.myInfo.clientAddress.port, this.logger, this.ubot);

        this.network.subscribe(async(notification) => {
            if ((notification instanceof UBotCloudNotification) ||
                (notification instanceof UBotCloudNotification_process)) {
                await this.ubot.onCloudNotify(notification);
            } else {
                // debug case
                this.logger.log("ubot" + this.myInfo.number + " receive notify: " + notification);
                if (notification.requestResult)
                    this.network.deliver(notification.from, new UBotTestNotification(this.myInfo, "hi ubot" + notification.from.number, false));
            }
        });
    }

    async processOptions() {
        /* Return true to exit, false to continue execution. */

        if (this.parser.options.has("nolog"))
            this.logger.nolog = true;

        if (this.parser.options.has("version")) {
            console.log("Version " + UBOT_VERSION);
            return true;
        }

        if (this.parser.options.has("?")) {
            console.log("usage called\n");
            console.log(UBotMain.NAME_STRING);
            console.log(this.parser.help());
            return true;
        }

        if (this.parser.values.has("config")) {
            await this.loadNodeConfig();
            await this.loadNetConfig();
        } else {
            console.error("No --config option passed, leaving");
            return true;
        }

        return false;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["nolog"], "do not buffer log messages (good for testing)")
            .option(["version"], "show version")
            .option(["c", "config"], "configuration file for the network", true, "config_file")
        ;

        return parser;
    }

    async shutdown() {
        this.logger.log("UBotMain.shutdown()...");
        let promises = [];
        if (this.ledger != null)
            promises.push(this.ledger.close());
        if (this.network != null)
            promises.push(this.network.shutdown());
        if (this.httpServer != null)
            promises.push(this.httpServer.shutdown());
        if (this.ubot != null)
            promises.push(this.ubot.shutdown());
        return Promise.all(promises);
    }

    async loadNodeConfig() {
        this.configRoot = this.parser.values.get("config");

        let settings = yaml.load(await io.fileGetContentsAsString(this.configRoot + "/config/config.yaml"));
        this.settings = settings;

        // let settingsShared;
        // if (await io.isAccessible(this.configRoot + "/config/shared.yaml"))
        //     settingsShared = yaml.load(await io.fileGetContentsAsString(this.configRoot + "/config/shared.yaml"));
        // else
        //     settingsShared = settings;

        //this.logger.log("node settings: " + JSON.stringify(settings, null, 2));

        let nodeName = t.getOrThrow(settings, "node_name");
        let nodeKeyFileName = this.configRoot + "/tmp/" + nodeName + ".private.unikey";
        //this.logger.log("nodeKeyFileName: " + nodeKeyFileName);

        this.nodeKey = new PrivateKey(await io.fileGetContentsAsBytes(nodeKeyFileName));

        this.myInfo = NodeInfo.withParameters(this.nodeKey.publicKey,
            t.getOrThrow(settings, "node_number"),
            nodeName,
            t.getOrThrow(settings, "ip")[0],
            settings.hasOwnProperty("ipv6") ? settings.ipv6[0] : null,
            t.getOrThrow(settings, "public_host"),
            t.getOrThrow(settings, "udp_server_port"),
            t.getOrThrow(settings, "http_client_port"),
            t.getOrThrow(settings, "http_public_port"));

        this.logger.log("key loaded: " + this.nodeKey.toString() +
            ",\t node local URL: " + this.myInfo.serverUrlString() +
            ",\t node public URL: " + this.myInfo.publicUrlString());
    }

    async loadNetConfig() {
        this.netConfig = await NetConfig.loadByPath(this.configRoot + "/config/nodes");
        this.logger.log("Network configuration is loaded from " + this.configRoot + ", " + this.netConfig.size + " ubots.");
    }

    debugSendUdp(val) {
        this.network.broadcast(this.myInfo, new UBotTestNotification(this.myInfo, val, true));
    }

}

module.exports = {UBotMain};
