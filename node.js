/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const Main = require("main").Main;
const Boss = require('boss.js');

let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let t = require("tools");

async function main() {

    let main = await new Main("--config", "../test/config/test_single_node/node1").run();

    await new Promise(resolve => setTimeout(resolve,100000000000));

    await main.shutdown();
}