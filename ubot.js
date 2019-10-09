/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const UBotMain = require("ubot/ubot_main").UBotMain;

const Boss = require('boss.js');
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const Contract = require("contract").Contract;
const t = require("tools");

async function main(args) {

    let ubotMain = new UBotMain(...args);
    await ubotMain.start();

    await sleep(100000000000);

    await ubotMain.shutdown();
}