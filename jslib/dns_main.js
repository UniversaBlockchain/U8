/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {DnsServer, DnsRRType} from 'web'
import * as tk from 'unit_tests/test_keys'

const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;
const UBotClient = require('ubot/ubot_client').UBotClient;
const UnsContract = require("services/unsContract").UnsContract;

class DnsMain {

    constructor(...args) {
        this.logger = new Logger(4096);

        this.parser = DnsMain.initOptionParser();
        this.parser.parse(args);
    }

    async start(host, port, uplinkNameServer, uplinkPort) {
        if (this.processOptions())
            return;

        this.logger.log("Start client with topology: " + this.topologyRoot);

        // start client
        this.client = await new UBotClient(await crypto.PrivateKey.generate(2048), this.topologyRoot).start();

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
        this.dnsServer.start(host, port, uplinkNameServer, uplinkPort);

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

        if (this.parser.values.has("topology"))
            this.topologyRoot = this.parser.values.get("topology");
        else {
            console.error("Topology not defined");
            return true;
        }

        return false;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["nolog"], "do not output log messages")
            .option(["t", "topology"], "network topology file", true, "topology_file")
        ;

        return parser;
    }

    async resolveName(name, rType) {
        try {
            let packedContract = await this.client.queryNameContract(name, "UNS2");
            if (packedContract != null) {
                let uns = await UnsContract.fromSealedBinary(packedContract, null);
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

        } catch (e) {
            console.error("Resolving DNS name error: " + e.message);
            console.error(e.stack);
        }

        return null;
    }
}

module.exports = {DnsMain};