/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {DnsServer, DnsRRType} from 'web'
import * as io from 'io'
import * as t from 'tools'

const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;
const UBotClient = require('ubot/ubot_client').UBotClient;
const UnsContract = require("services/unsContract").UnsContract;
const yaml = require('yaml');

class DnsMain {

    constructor(...args) {
        this.logger = new Logger(4096);

        this.parser = DnsMain.initOptionParser();
        this.parser.parse(args);
    }

    async start() {
        if (this.processOptions())
            return;

        if (!await this.loadConfig())
            return;

        this.logger.log("Start client with topology: " + this.topologyPath);

        // start client
        this.client = await new UBotClient(await crypto.PrivateKey.generate(2048), this.topologyPath, null, null, this.logger).start();

        this.logger.log("Connect to Universa nodes...");
        await this.client.connectAllNodes();

        // start DNS server
        this.dnsServer = new DnsServer();
        this.dnsServer.setQuestionCallback(async question => {
            this.logger.log("Received question: name = " + question.name + ", rType = " + question.rType);

            question.resolveThroughUplink_start();

            let result = await this.resolveName(question.name, question.rType);
            if (result != null) {
                result.A.forEach(Arecord => question.addAnswer_typeA(Arecord.ttl, Arecord.IPv4));
                result.AAAA.forEach(AAAArecord => question.addAnswer_typeAAAA(AAAArecord.ttl, AAAArecord.IPv6));
                result.CNAME.forEach(CNAMErecord => question.addAnswer_typeCNAME(CNAMErecord.ttl, CNAMErecord.domain_name));
                result.MX.forEach(MXrecord => question.addAnswer_typeMX(MXrecord.ttl, MXrecord.preference, MXrecord.exchange));

                question.sendAnswer();
            } else {
                question.resolveThroughUplink_finish();
            }
        });
        this.dnsServer.start(this.host, this.port, this.uplinkNameServer, this.uplinkPort);

        this.logger.log("DNS server started");
    }

    async shutdown() {
        this.logger.log("DNS server shutdown...");

        await this.dnsServer.stop();
        await this.client.shutdown();
    }

    processOptions() {
        // Return true to exit, false to continue execution

        if (this.parser.options.has("nolog"))
            this.logger.nolog = true;

        if (this.parser.options.has("?")) {
            console.log("usage called\n");
            console.log(this.parser.help());
            return true;
        }

        if (this.parser.values.has("config"))
            this.configPath = this.parser.values.get("config");
        else {
            console.error("Config not defined");
            return true;
        }

        return false;
    }

    async loadConfig() {
        try {
            let settings = yaml.load(await io.fileGetContentsAsString(this.configPath));

            this.logger.log("DNS server settings: " + JSON.stringify(settings, null, 2));

            this.topologyPath = t.getOrThrow(settings, "topologyPath");
            this.host = t.getOrThrow(settings, "host");
            this.port = t.getOrThrow(settings, "port");
            this.uplinkNameServer = t.getOrThrow(settings, "uplinkNameServer");
            this.uplinkPort = t.getOrThrow(settings, "uplinkPort");
            this.trustLevel = t.getOrThrow(settings, "trustLevel");
            this.breakLevel = t.getOrThrow(settings, "breakLevel");

        } catch (err) {
            console.error("Failed loading config: " + err.message);
            console.error(err.stack);
            return false;
        }

        return true;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["nolog"], "do not output log messages")
            .option(["c", "config"], "DNS configuration file", true, "config_file")
        ;

        return parser;
    }

    async checkContractTrust(id) {
        let result = await this.client.checkStateWithTrust(id, this.trustLevel, this.breakLevel);

        if (!result)
            this.logger.log("UNS contract " + id.toString() + " isn`t APPROVED by Universa network");

        return result;
    }

    async resolveName(name, rType) {
        try {
            let packedContract = await this.client.queryNameContract(name, "UNS2");
            if (packedContract != null) {
                let uns = await UnsContract.fromSealedBinary(packedContract, null);

                if (await this.checkContractTrust(uns.id)) {
                    let data = uns.getAllData();

                    let answer = {A: [], AAAA: [], CNAME: [], MX: []};
                    data.forEach(dnsRecord => {
                        if (dnsRecord.dns_type === "A" && (rType === DnsRRType.DNS_A || rType === DnsRRType.DNS_ANY))
                            answer.A.push(dnsRecord.value);
                        if (dnsRecord.dns_type === "AAAA" && (rType === DnsRRType.DNS_AAAA || rType === DnsRRType.DNS_ANY))
                            answer.AAAA.push(dnsRecord.value);
                        if (dnsRecord.dns_type === "CNAME" && (rType === DnsRRType.DNS_CNAME || rType === DnsRRType.DNS_ANY))
                            answer.CNAME.push(dnsRecord.value);
                        if (dnsRecord.dns_type === "MX" && (rType === DnsRRType.DNS_MX || rType === DnsRRType.DNS_ANY))
                            answer.MX.push(dnsRecord.value);
                    });

                    return answer;
                }
            }

        } catch (e) {
            console.error("Resolving DNS name error: " + e.message);
            console.error(e.stack);
        }

        return null;
    }
}

module.exports = {DnsMain};