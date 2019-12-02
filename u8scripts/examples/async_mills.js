/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let t = require("tools");

import {unit} from 'test'

require('unit_tests/async_mills_test');

async function main() {
    return await unit.perform();
}
