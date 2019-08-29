/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import * as tk from 'unit_tests/test_keys'
const ItemState = require("itemstate").ItemState;
const ItemCache = require("itemcache").ItemCache;
const ItemResult = require("itemresult").ItemResult;

async function createTestLedger() {
    return new Ledger("host=localhost port=5432 dbname=unit_tests");
}

unit.test("itemcache_test: putAndGet", async () => {
    let cache = new ItemCache(1800);

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    assert(cache.get(contract.id) == null);
    assert(cache.getResult(contract.id) == null);
    assert(cache.size === 0);

    let now = new Date();
    let expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);
    cache.put(contract, ItemResult.from(ItemState.PENDING, false, now, expires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.PENDING);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === expires.getTime());
    assert(cache.size === 1);

    cache.shutdown();
});

unit.test("itemcache_test: update", async () => {
    let cache = new ItemCache(1800);

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let now = new Date();
    let expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);
    cache.put(contract, ItemResult.from(ItemState.PENDING, false, now, expires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.PENDING);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === expires.getTime());
    assert(cache.size === 1);

    let newExpires = new Date(expires);
    newExpires.setMonth(newExpires.getMonth() + 24);
    cache.update(contract.id, ItemResult.from(ItemState.APPROVED, false, now, newExpires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.APPROVED);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === newExpires.getTime());
    assert(cache.size === 1);

    cache.shutdown();
});

unit.test("itemcache_test: cleanUp", async () => {
    let cache = new ItemCache(1);

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let now = new Date();
    let expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);
    cache.put(contract, ItemResult.from(ItemState.PENDING, false, now, expires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.PENDING);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === expires.getTime());
    assert(cache.size === 1);

    console.log("waiting...");
    await sleep(6000);

    assert(cache.get(contract.id) == null);
    assert(cache.getResult(contract.id) == null);
    assert(cache.size === 0);

    cache.shutdown();
});

unit.test("itemcache_test: subscribeStateRecord", async () => {
    let cache = new ItemCache(1800);
    let ledger = await createTestLedger();

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let record = await ledger.findOrCreate(contract.id);

    cache.subscribeStateRecord(record);

    cache.put(contract, ItemResult.from(record.state, false, record.createdAt, record.expiresAt));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === record.state);
    assert(cache.getResult(contract.id).createdAt.getTime() === record.createdAt.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === record.expiresAt.getTime());
    assert(cache.size === 1);

    await record.setPendingPositive();

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.PENDING_POSITIVE);
    assert(cache.getResult(contract.id).createdAt.getTime() === record.createdAt.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === record.expiresAt.getTime());
    assert(cache.size === 1);

    let newExpires = new Date(record.expiresAt);
    newExpires.setMonth(newExpires.getMonth() + 3);
    await record.approve(null, newExpires);

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.APPROVED);
    assert(cache.getResult(contract.id).createdAt.getTime() === record.createdAt.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === newExpires.getTime());
    assert(cache.size === 1);

    await ledger.close();
    cache.shutdown();
});