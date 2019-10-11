/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, assertSilent, unit} from 'test'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

const PseudoRandom = require("pseudo_random").PseudoRandom;

unit.test("pseudo_random_test: check random bytes", async () => {
    let hashId1 = HashId.of(randomBytes(64));
    let hashId2 = HashId.of(randomBytes(64));

    let pr1 = new PseudoRandom(hashId1);
    let pr2 = new PseudoRandom(hashId2);
    let pr3 = new PseudoRandom(hashId1);
    let pr4 = new PseudoRandom(hashId2);

    let rnd1 = [pr1.randomBytes(12), pr1.randomBytes(64)];
    let rnd2 = [pr2.randomBytes(12), pr2.randomBytes(64)];
    let rnd3 = [pr3.randomBytes(12), pr3.randomBytes(64)];
    let rnd4 = [pr4.randomBytes(12), pr4.randomBytes(64)];

    // console.log(JSON.stringify(rnd1));
    // console.log(JSON.stringify(rnd2));
    // console.log(JSON.stringify(rnd3));
    // console.log(JSON.stringify(rnd4));

    assert(t.valuesEqual(rnd1, rnd3));
    assert(!t.valuesEqual(rnd1, rnd2));
    assert(t.valuesEqual(rnd2, rnd4));
});