import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

// with bigints
function jsonStringify(obj) {
    return JSON.stringify(obj, function(k,v){return (typeof v==='bigint')?v.toString()+"n":v;});
}

async function createTestLedger() {
    //await sleep(500); // await gc collects db pool from previous test
    return new Ledger("host=localhost port=5432 dbname=unit_tests");
}

unit.test("ledger_test: hello", async () => {
    let ledger = await createTestLedger();
    console.log(jsonStringify(await ledger.findOrCreate(HashId.of(randomBytes(64)))));
    console.log(jsonStringify(await ledger.getLedgerSize()));
});

unit.test("ledger_test: ledgerBenchmark", async () => {
    let ledger = await createTestLedger();
    console.log();
    let nIds = 40 * 32;
    console.log("prepare hashes...");
    let hashes = [];
    for (let i = 0; i < nIds; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)).digest);
    console.log("start benchmark...");
    let t0 = new Date().getTime();
    let promises = [];
    for (let i = 0; i < nIds; ++i) {
        promises.push(ledger.findOrCreate(hashes[i]));
    }
    await Promise.all(promises);
    let dt = new Date().getTime() - t0;
    console.log("total time: " + dt + " ms");
    console.log("  TPS: " + (nIds/dt*1000).toFixed(0));
});
