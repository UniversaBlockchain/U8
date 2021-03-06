/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
import {Notification, ItemNotification, ResyncNotification, ParcelNotification} from "notification";
import {NodeInfo} from 'web'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'
import * as tk from 'unit_tests/test_keys'

const BossStreams = require('boss_streams.js');
const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;

unit.test("notification_test: ItemNotification pack", () => {
    let ni = NodeInfo.withParameters(tk.TestKeys.getKey().publicKey, 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001, 8001, 9001);
    let id = HashId.of(randomBytes(64));
    let ir = ItemResult.from(ItemState.APPROVED, false, new Date(), new Date());
    let n = new ItemNotification(ni, id, ir, false);

    let w = new BossStreams.Writer();
    Notification.write(w, n);
    let pack = w.get();

    let r = new BossStreams.Reader(pack);
    let nn = Notification.read(ni, r);

    assert(nn.equals(n));
});

unit.test("notification_test: ResyncNotification pack", () => {
    let ni = NodeInfo.withParameters(tk.TestKeys.getKey().publicKey, 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001, 8001, 9001);
    let id = HashId.of(randomBytes(64));
    let n = new ResyncNotification(ni, id, false, ItemState.DECLINED, true);

    let w = new BossStreams.Writer();
    Notification.write(w, n);
    let pack = w.get();

    let r = new BossStreams.Reader(pack);
    let nn = Notification.read(ni, r);

    assert(nn.equals(n));

    n = new ResyncNotification(ni, id, true);

    w = new BossStreams.Writer();
    Notification.write(w, n);
    pack = w.get();

    r = new BossStreams.Reader(pack);
    nn = Notification.read(ni, r);

    assert(n.equals(nn));
});