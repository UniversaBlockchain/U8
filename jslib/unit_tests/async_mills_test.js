/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {udp} from 'network'
import * as trs from "timers";
import {HttpServer, HttpClient} from 'web'
import {MemoryUser1} from "research"
import * as tk from 'unit_tests/test_keys'

unit.test("stress_test_bindCppClass_async", async () => {
    let asyncBufSize = 100;
    let list = [];
    let counter = 0;
    let eachItemMinimumBytesUsage = 10*1024;
    let MemoryUserClasses = [research.MemoryUser1, research.MemoryUser2, research.MemoryUser3];
    while (true) {
        let listFill = [];
        for (let i = 0; (i < asyncBufSize*2) && (list.length+listFill.length < 1000); ++i)
            listFill.push((new MemoryUserClasses[Math.floor(Math.random()*3)]).fillAsync(eachItemMinimumBytesUsage));
        listFill = await Promise.all(listFill);
        list = list.concat(listFill);
        let listCheck = [];
        for (let i = 0; (i < asyncBufSize) && (list.length > 0); ++i) {
            ++counter;
            let m = list.shift();
            listCheck.push(m.checkAsync())
            if (counter % 10000 == 0) {
                console.log("counter: " + counter + ", list.length: " + list.length);
            }
        }
        listCheck = await Promise.all(listCheck);
        for (let i = 0; i < listCheck.length; ++i) {
            let res = listCheck[i];
            if (res !== true)
                console.error("error detected, check: " + res);
            assertSilent(res === true);
        }
    }
});

/*unit.test("stress_test_bindCppClass", async () => {
    let list = [];
    let counter = 0;
    let eachItemMinimumBytesUsage = 1*1024;
    let MemoryUserClasses = [research.MemoryUser1, research.MemoryUser2, research.MemoryUser3];
    while (true) {
        ++counter;
        for (let i = 0; (i < 10) && (list.length < 1000); ++i)
            list.push((new MemoryUserClasses[Math.floor(Math.random()*3)]).fill(eachItemMinimumBytesUsage));
        let m = list.shift();
        let res = m.check();
        if (res !== true)
            console.error("error detected, check: " + res);
        assertSilent(res === true);
        if (counter % 10000 == 0) {
            console.log("counter: " + counter + ", list.length: " + list.length);
        }
    }
});*/
