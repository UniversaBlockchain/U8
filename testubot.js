// this is just a test file to run with u8

let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;

import {unit} from 'test'

require('ubot/unit_tests/ubot_main_test');

async function main() {
    return await unit.perform();
}
