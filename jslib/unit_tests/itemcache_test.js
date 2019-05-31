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

    let now = new Date();
    let expires = new Date();
    expires.setMinutes(expires.getMinutes() + 5);
    cache.put(contract, ItemResult.from(ItemState.PENDING, false, now, expires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.PENDING);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === expires.getTime());

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

    let newExpires = new Date(expires);
    newExpires.setMonth(newExpires.getMonth() + 24);
    cache.update(contract.id, ItemResult.from(ItemState.APPROVED, false, now, newExpires));

    assert(cache.get(contract.id).equals(contract));
    assert(cache.getResult(contract.id).state === ItemState.APPROVED);
    assert(cache.getResult(contract.id).createdAt.getTime() === now.getTime());
    assert(cache.getResult(contract.id).expiresAt.getTime() === newExpires.getTime());

    cache.shutdown();
});

/*unit.test("itemcache_test: cleanUp", async () => {

});

unit.test("itemcache_test: subscribeStateRecord", async () => {
    let ledger = await createTestLedger();

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let record = await ledger.findOrCreate(contract.id);

    await ledger.close();
});*/