/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const DnsMain = require("dns_main").DnsMain;

async function main(args) {

    let dnsMain = new DnsMain(...args);
    await dnsMain.start();

    await sleep(100000000000);

    await dnsMain.shutdown();
}