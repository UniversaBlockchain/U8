/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// this is just a test file tu run with u8

let io = require("io");
let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let TransactionPack = require("transactionpack").TransactionPack;
let ExtendedSignature = require("extendedsignature").ExtendedSignature;
let roles = require("roles");
let t = require("tools");

const Boss = require('boss.js');
const BossStreams = require('boss_streams.js');

import {expect, unit} from 'test'

// require('unit_tests/services/uns_register_test');
require('unit_tests/contract_test');
require('unit_tests/role_test');
require('unit_tests/simplerole_test');
require('unit_tests/listrole_test');
require('unit_tests/linkrole_test');

// require('unit_tests/deltas_test');
// require('unit_tests/worker_tests');
// require('unit_tests/boss_test');
// require('unit_tests/crypto_test');
// require('unit_tests/pseudo_random_test');
// require('unit_tests/network_test');
// require('unit_tests/file_tests');
// require('unit_tests/pg_test');
// require('unit_tests/collection_test');
// require('unit_tests/asyncevent_test');
// require('unit_tests/lock_test');
// require('unit_tests/web_test');

async function main(args) {
    await unit.perform(args);
}
