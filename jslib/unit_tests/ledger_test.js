import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'

const ItemState = require("itemstate").ItemState;

// with bigints
function jsonStringify(obj) {
    return JSON.stringify(obj, function(k,v){return (typeof v==='bigint')?v.toString()+"n":v;});
}

async function createTestLedger() {
    return new Ledger("host=localhost port=5432 dbname=unit_tests");
}

unit.test("ledger_test: hello", async () => {
    let ledger = await createTestLedger();
    console.log(jsonStringify(await ledger.findOrCreate(HashId.of(randomBytes(64)))));
    console.log(jsonStringify(await ledger.getLedgerSize()));
    ledger.close();
});

unit.test("ledger_test: ledgerBenchmark", async () => {
    let ledger = await createTestLedger();
    console.log();
    let nIds = 40 * 32;
    console.log("prepare hashes...");
    let hashes = [];
    for (let i = 0; i < nIds; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)));
    console.log("start benchmark...");
    let t0 = new Date().getTime();
    let promises = [];
    for (let i = 0; i < nIds; ++i) {
        //promises.push(ledger.findOrCreate(hashes[i]));
        promises.push(new Promise(async (resolve, reject) => {
            let row = await ledger.findOrCreate(hashes[i]);
            if (!hashes[i].equals(crypto.HashId.withDigest(row[1])))
                reject(new Error("findOrCreate returns wrong hashId"));
            resolve();
        }));
    }
    await Promise.all(promises);
    let dt = new Date().getTime() - t0;
    console.log("total time: " + dt + " ms");
    console.log("  TPS: " + (nIds/dt*1000).toFixed(0));
    console.log("  ledger size: " + jsonStringify(await ledger.getLedgerSize()));
    ledger.close();
});

unit.test("ledger_test: getRecord", async () => {
    let ledger = await createTestLedger();

    //get empty
    assert(await ledger.getRecord(HashId.of(randomBytes(64))) == null);

    //create and get
    let hash = HashId.of(randomBytes(64));
    let row = await ledger.findOrCreate(hash);
    let record = await ledger.getRecord(hash);

    assert(record.recordId === row[0]);
    assert(record.id.equals(hash));
    assert(record.id.equals(crypto.HashId.withDigest(row[1])));
    assert(record.state === ItemState.PENDING);
    assert(record.lockedByRecordId == null);
    assert(record.createdAt.getTime() / 1000 === row[4]);
    assert(record.expiresAt.getTime() / 1000 === Number(row[5]));
    ledger.close();
});
