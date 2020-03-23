/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {DnsServer, DnsRRType} from 'web'
import * as tk from 'unit_tests/test_keys'

const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;
const Contract = require("contract").Contract;
const UnsContract = require("services/unsContract").UnsContract;

const tt = require("test_tools");

class DnsMain {

    constructor(...args) {
        this.logger = new Logger(4096);

        this.parser = DnsMain.initOptionParser();
        this.parser.parse(args);
    }

    async start() {
        if (this.processOptions())
            return;

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
        this.dnsServer.start("0.0.0.0", 5353, "8.8.4.4");

        this.logger.log("DNS server started");
    }

    async shutdown() {
        this.logger.log("DNS server shutdown...");

        await this.dnsServer.stop();
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

        return false;
    }

    static initOptionParser() {
        let parser = new OptionParser();

        parser
            .option(["?", "h", "help"], 'show help')
            .option(["nolog"], "do not output log messages")
        ;

        return parser;
    }

    async resolveName(name, rType) {
        if (name === "test.ya.ru") {
            try {
                let key = tk.TestKeys.getKey();
                let unsContract = UnsContract.fromPrivateKey(key);

                unsContract.addName(name, name, "");

                unsContract.addData({type: "dns", dns_type: "A", value: {ttl: 300, IPv4: "127.0.0.1"}});
                unsContract.addData({type: "dns", dns_type: "AAAA", value: {ttl: 600, IPv6: "2a02:6b8::2:242"}});
                unsContract.addData({type: "dns", dns_type: "CNAME", value: {ttl: 500, domain_name: "ya.ru"}});
                unsContract.addData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 20, exchange: "alt-mx.ya.ru"}});
                unsContract.addData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 5, exchange: "add-mx.ya.ru"}});

                unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
                await unsContract.seal(true);

                let uns = await Contract.fromPackedTransaction(await unsContract.getPackedTransaction());
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
            catch (e) {
                console.error(e.message);
                console.error(e.stack);
            }

            // let answer = {};
            // if (rType === DnsRRType.DNS_A || rType === DnsRRType.DNS_ANY)
            //     answer.A = {ttl: 300, IPv4: "127.0.0.1"};
            // if (rType === DnsRRType.DNS_AAAA || rType === DnsRRType.DNS_ANY)
            //     answer.AAAA = {ttl: 600, IPv6: "2a02:6b8::2:242"};
            // if (rType === DnsRRType.DNS_CNAME || rType === DnsRRType.DNS_ANY)
            //     answer.CNAME = {ttl: 500, domain_name: "ya.ru"};
            // if (rType === DnsRRType.DNS_MX || rType === DnsRRType.DNS_ANY) {
            //     answer.MX = [
            //         {ttl: 550, preference: 20, exchange: "alt-mx.ya.ru"},
            //         {ttl: 550, preference: 5, exchange: "add-mx.ya.ru"}
            //     ];
            // }
            // return answer;

        } else
            return null;
    }
}

module.exports = {DnsMain};