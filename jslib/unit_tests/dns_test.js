/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert} from 'test'
import * as tk from 'unit_tests/test_keys'

const UnsContract = require("services/unsContract").UnsContract;
const UBotClient = require('ubot/ubot_client').UBotClient;
const tt = require("test_tools");

const TOPOLOGY_ROOT = "../test/ubot/topology/";
const TOPOLOGY_FILE = "universa.pro.json";

unit.test("dns_test: PRO DNS", async () => {
    let key = tk.TestKeys.getKey();
    let unsContract = UnsContract.fromPrivateKey(key);

    unsContract.addName("test.ya.ru", "test.ya.ru", "");

    unsContract.addData({type: "dns", dns_type: "A", value: {ttl: 300, IPv4: "127.0.0.1"}});
    unsContract.addData({type: "dns", dns_type: "AAAA", value: {ttl: 600, IPv6: "2a02:6b8::2:242"}});
    unsContract.addData({type: "dns", dns_type: "CNAME", value: {ttl: 500, domain_name: "ya.ru"}});
    unsContract.addData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 20, exchange: "alt-mx.ya.ru"}});
    unsContract.addData({type: "dns", dns_type: "MX", value: {ttl: 550, preference: 5, exchange: "add-mx.ya.ru"}});

    unsContract.nodeInfoProvider = tt.createNodeInfoProvider();
    await unsContract.seal(true);

    // let netClient = await new UBotClient(tk.getTestKey(), TOPOLOGY_ROOT + TOPOLOGY_FILE).start();
    //
    // console.log("Register UNS contract...");
    // let ir = await netClient.register(await unsContract.getPackedTransaction(), 10000);
    //
    // assert(ir.state === ItemState.APPROVED);
    //
    // await netClient.shutdown();
});