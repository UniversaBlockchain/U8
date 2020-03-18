/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {HttpServer, DnsServer, DnsRRType} from 'web'

const OptionParser = require("optionparser").OptionParser;

//import * as tk from 'unit_tests/test_keys'
//const Contract = require("contract").Contract;

async function main(args) {

    // parse options
    let parser = new OptionParser();
    parser
        .option(["?", "h", "help"], 'show help')
        .option(["nolog"], "do not output log messages")
    ;
    parser.parse(args);

    // check options
    if (parser.options.has("?")) {
        console.log("usage called\n");
        console.log(parser.help());
        return;
    }

    let nolog = parser.options.has("nolog");

    // start DNS server
    let dnsServer = new DnsServer();
    dnsServer.setQuestionCallback(async question => {
        if (!nolog)
            console.log("Received question: name = " + question.name + ", rType = " + question.rType);

        question.resolveThroughUplink_start();

        let result = await resolveName(question.name, question.rType);
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
    dnsServer.start("0.0.0.0", 5353, "8.8.4.4");

    if (!nolog)
        console.log("DNS server started.");

    await sleep(100000000000);

    await dnsServer.stop();
}

async function resolveName(name, rType) {
    if (name === "test.ya.ru") {
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