/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// this is just a test file to run with u8

let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let t = require("tools");

import {unit} from 'test'

require('ubot/unit_tests/ubot_pro_test');
require('ubot/unit_tests/ubot_commands_test');
//require('ubot/unit_tests/ubot_main_test');

async function main() {
    return await unit.perform();
}
