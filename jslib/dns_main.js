/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {DnsServer, DnsRRType} from 'web'
import * as tk from 'unit_tests/test_keys'

const Logger = require("logger").Logger;
const OptionParser = require("optionparser").OptionParser;

//const Contract = require("contract");
const UnsContract = require("services/unsContract").UnsContract;
const UnsName = require("services/unsName").UnsName;
const UnsRecord = require("services/unsRecord").UnsRecord;

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
                if (result.A != null)
                    question.addAnswer_typeA(result.A.ttl, result.A.IPv4);
                if (result.AAAA != null)
                    question.addAnswer_typeAAAA(result.AAAA.ttl, result.AAAA.IPv6);
                if (result.CNAME != null)
                    question.addAnswer_typeCNAME(result.CNAME.ttl, result.CNAME.domain_name);
                if (result.MX != null)
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
            // let key = tk.TestKeys.getKey();
            // let unsContract = UnsContract.fromPrivateKey(key);
            // let reducedName = name;
            //
            // let unsName = new UnsName(reducedName);
            // unsName.unsReducedName = reducedName;
            //
            // unsName.addUnsRecord(UnsRecord.fromData({type: "dns", dns_type: "A", value: {ttl: 300, IPv4: "127.0.0.1"}}));
            // unsName.addUnsRecord(UnsRecord.fromData({type: "dns", dns_type: "AAAA", value: {ttl: 600, IPv6: "2a02:6b8::2:242"}}));
            // unsName.addUnsRecord(UnsRecord.fromData({type: "dns", dns_type: "CNAME", value: {ttl: 500, domain_name: "ya.ru"}}));
            // unsName.addUnsRecord(UnsRecord.fromData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 20, exchange: "alt-mx.ya.ru"}}));
            // unsName.addUnsRecord(UnsRecord.fromData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 5, exchange: "add-mx.ya.ru"}}));
            //
            // unsContract.addUnsName(unsName);
            //
            // await unsContract.seal(true);
            //
            // let uns = await Contract.fromPackedTransaction(await unsContract.getPackedTransaction());
            // let data = uns.getAllData();

            let answer = {};
            if (rType === DnsRRType.DNS_A || rType === DnsRRType.DNS_ANY)
                answer.A = {ttl: 300, IPv4: "127.0.0.1"};
            if (rType === DnsRRType.DNS_AAAA || rType === DnsRRType.DNS_ANY)
                answer.AAAA = {ttl: 600, IPv6: "2a02:6b8::2:242"};
            if (rType === DnsRRType.DNS_CNAME || rType === DnsRRType.DNS_ANY)
                answer.CNAME = {ttl: 500, domain_name: "ya.ru"};
            if (rType === DnsRRType.DNS_MX || rType === DnsRRType.DNS_ANY) {
                answer.MX = [
                    {ttl: 550, preference: 20, exchange: "alt-mx.ya.ru"},
                    {ttl: 550, preference: 5, exchange: "add-mx.ya.ru"}
                ];
            }
            return answer;

            // try {
            //     let k = tk.TestKeys.getKey();
            //     let c = Contract.fromPrivateKey(k);
            //
            //     c.state.data.DNS_records = answer;
            //
            //     console.log(JSON.stringify(c.state.data.DNS_records));
            //
            //     await c.seal(true);
            //     let pack = await c.getPackedTransaction();
            //     let cc = await Contract.fromPackedTransaction(pack);
            //
            //     console.error(JSON.stringify(cc.state.data.DNS_records));
            //
            //     return cc.state.data.DNS_records;
            // }
            // catch (e) {
            //     console.error(e.message);
            // }
        } else
            return null;
    }
}

module.exports = {DnsMain};