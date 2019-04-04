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

function assertSameRecords(record1, record2) {
    assert(record1.recordId === record2.recordId);
    assert(record1.id.equals(record2.id));
    assert(record1.state === record2.state);
    assert(record1.lockedByRecordId === record2.lockedByRecordId);
    assert(record1.createdAt.getTime() === record2.createdAt.getTime());
    assert(record1.expiresAt.getTime() === record2.expiresAt.getTime())
}

unit.test("ledger_test: hello", async () => {
    let ledger = await createTestLedger();
    console.log(jsonStringify(await ledger.findOrCreate(HashId.of(randomBytes(64)))));
    console.log(jsonStringify(await ledger.getLedgerSize()));
    await ledger.close();
});

unit.test("ledger_test: ledgerBenchmark", async () => {
    let ledger = await createTestLedger();
    console.log();
    let nIds = 400 * 32;
    console.log("prepare hashes...");
    let hashes = [];
    for (let i = 0; i < nIds; ++i)
        hashes.push(crypto.HashId.of(randomBytes(16)));
    console.log("start benchmark...");
    let t0 = new Date().getTime();
    let promises = [];
    for (let i = 0; i < nIds*2; ++i) {
        let rnd = Math.floor(Math.random()*nIds);
        //promises.push(ledger.findOrCreate(hashes[rnd]));
        promises.push(new Promise(async (resolve, reject) => {
            let row = await ledger.findOrCreate(hashes[rnd]);
            if (!hashes[rnd].equals(crypto.HashId.withDigest(row[1])))
                reject(new Error("findOrCreate returns wrong hashId"));
            resolve();
        }));
    }
    await Promise.all(promises);
    let dt = new Date().getTime() - t0;
    console.log("total time: " + dt + " ms");
    console.log("  TPS: " + (nIds*2/dt*1000).toFixed(0));
    console.log("  ledger size: " + jsonStringify(await ledger.getLedgerSize()));
    assert(ledger.bufParams.findOrCreate_insert.bufInProc.size == 0);
    await ledger.close();
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
    assert(record.lockedByRecordId === 0);
    assert(record.createdAt.getTime() / 1000 === row[4]);
    assert(record.expiresAt.getTime() / 1000 === Number(row[5]));
    await ledger.close();
});

unit.test("ledger_test: save", async () => {
    let ledger = await createTestLedger();

    //create and get
    let hash = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash);
    let r1 = await ledger.getRecord(hash);
    hash = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash);
    let r2 = await ledger.getRecord(hash);

    r1.state = ItemState.APPROVED;
    r2.state = ItemState.DECLINED;

    await r1.save();
    await r2.save();

    await r1.reload();
    let r3 = await ledger.getRecord(r1.id);

    assert(r1.state === ItemState.APPROVED);
    assert(r3.state === ItemState.APPROVED);

    await r2.reload();
    assert(r2.state === ItemState.DECLINED);

    await ledger.close();
});

unit.test("ledger_test: destroy", async () => {
    let ledger = await createTestLedger();

    //create and get
    let hash = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash);
    let record = await ledger.getRecord(hash);

    await record.destroy();

    record = await ledger.getRecord(record.id);

    assert(record == null);
    await ledger.close();
});

unit.test("ledger_test: createOutputLockRecord", async () => {
    let ledger = await createTestLedger();

    let hash1 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash1);
    let owner = await ledger.getRecord(hash1);

    let hash2 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash2);
    let other = await ledger.getRecord(hash2);

    let id = HashId.of(randomBytes(64));

    let r1 = await owner.createOutputLockRecord(id);
    await r1.reload();
    assert(id === r1.id);
    assert(ItemState.LOCKED_FOR_CREATION === r1.state);
    assert(owner.recordId === r1.lockedByRecordId);

    let r2 = await other.createOutputLockRecord(id);
    assert(r2 == null);

    let r3 = await owner.createOutputLockRecord(id);
    assert(r3 == null);

    assert(await owner.createOutputLockRecord(other.id) == null);

    let r4 = null;
    try
    {
        // And hacked low level operation must fail too
        r4 = await ledger.createOutputLockRecord(owner.recordId, other.id);
    } catch (e) {}

    assert(r4 == null);

    await ledger.close();
});

function getTestRecordsCount(ledger, hashId) {
    return new Promise((resolve, reject) => {
        ledger.dbPool_.withConnection(con => {
            con.executeQuery(qr => {
                    con.release();
                    resolve(Number(qr.getRows(1)[0][0]));
                }, e => {
                    con.release();
                    reject(e);
                },
                "select count(*) from ledger_testrecords where hash = ?",
                hashId.digest
            );
        });
    });
}

unit.test("ledger_test: moveToTestnet", async () => {
    let ledger = await createTestLedger();

    let hashId = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hashId);
    let r = await ledger.getRecord(hashId);

    await r.save();

    assert(await getTestRecordsCount(ledger, hashId) === 0);

    await r.markTestRecord();

    assert(await getTestRecordsCount(ledger, hashId) === 1);

    await r.markTestRecord();

    assert(await getTestRecordsCount(ledger, hashId) === 1);

    await ledger.close();
});

unit.test("ledger_test: cache test", async () => {
    let ledger = await createTestLedger();

    let hash = HashId.of(randomBytes(64));

    assert(ledger.getFromCache(hash) == null);

    //create and get
    await ledger.findOrCreate(hash);
    let record = await ledger.getRecord(hash);

    let r1 = ledger.getFromCache(hash);
    let r2 = ledger.getFromCacheById(record.recordId);
    assert(r1 != null);
    assert(r2 != null);

    //compare records
    assert(record.recordId === r1.recordId);
    assert(record.id.equals(r1.id));
    assert(record.state === r1.state);
    assert(record.lockedByRecordId === r1.lockedByRecordId);
    assert(record.createdAt.getTime() === r1.createdAt.getTime());
    assert(record.expiresAt.getTime() === r1.expiresAt.getTime());

    assert(record.recordId === r2.recordId);
    assert(record.id.equals(r2.id));
    assert(record.state === r2.state);
    assert(record.lockedByRecordId === r2.lockedByRecordId);
    assert(record.createdAt.getTime() === r2.createdAt.getTime());
    assert(record.expiresAt.getTime() === r2.expiresAt.getTime());

    await record.destroy();

    assert(ledger.getFromCache(hash) == null);
    assert(ledger.getFromCache(record.id) == null);
    assert(ledger.getFromCacheById(record.recordId) == null);

    record = await ledger.getRecord(record.id);

    assert(record == null);

    await ledger.close();
});

unit.test("ledger_test: checkLockOwner", async () => {
    let ledger = await createTestLedger();

    let hash1 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash1);
    let existing = await ledger.getRecord(hash1);

    await existing.approve();

    let hash2 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash2);
    let r = await ledger.getRecord(hash2);

    let r1 = await r.lockToRevoke(existing.id);

    await existing.reload();
    await r.reload();

    assertSameRecords(existing, r1);

    assert(ItemState.LOCKED === existing.state);
    assert(r.recordId === existing.lockedByRecordId);

    let currentOwner = await ledger.getLockOwnerOf(existing);

    assertSameRecords(r, currentOwner);

    await ledger.close();
});

unit.test("ledger_test: lockForRevoking", async () => {
    let ledger = await createTestLedger();

    let hash1 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash1);
    let existing = await ledger.getRecord(hash1);

    await existing.approve();

    let hash2 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash2);
    let existing2 = await ledger.getRecord(hash2);

    await existing2.approve();

    let hash3 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash3);
    let r = await ledger.getRecord(hash3);

    let r1 = await r.lockToRevoke(existing.id);

    await existing.reload();
    await r.reload();

    assertSameRecords(existing, r1);

    assert(ItemState.LOCKED === existing.state);
    assert(r.recordId ===  existing.lockedByRecordId);

    // we lock again the same record it should fail:
    let r2 = await r.lockToRevoke(existing.id);

    assert(r2 == null);
    assert(ItemState.LOCKED === existing.state);
    assert(r.recordId === existing.lockedByRecordId);

    let r3 = await r.lockToRevoke(existing2.id);
    await existing2.reload();

    assertSameRecords(existing2, r3);

    assert(ItemState.LOCKED === existing2.state);
    assert(r.recordId === existing2.lockedByRecordId);

    await ledger.close();
});

unit.test("ledger_test: lockForCreationRevoked", async () => {
    let ledger = await createTestLedger();

    let hash1 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash1);
    let r = await ledger.getRecord(hash1);

    let r1 = await r.createOutputLockRecord(HashId.of(randomBytes(64)));

    assert(ItemState.LOCKED_FOR_CREATION === r1.state);
    assert(r.recordId === r1.lockedByRecordId);

    let r2 = await r.lockToRevoke(r1.id);
    assert(ItemState.LOCKED_FOR_CREATION_REVOKED === r2.state);
    await r1.reload();

    assertSameRecords(r2, r1);
    await r.reload();

    assert(r.recordId === r1.lockedByRecordId);

    await ledger.close();
});