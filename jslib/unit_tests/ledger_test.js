import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'
import * as tk from 'unit_tests/test_keys'

const ItemState = require("itemstate").ItemState;
const ex = require("exceptions");

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

function assertAlmostSame(time1, time2) {
    let delta = time1.getTime() - time2.getTime();
    assert(delta < 5000 && delta > -5000);  //5 sec
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
    let nIds = 4;
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
    assert(id.equals(r1.id));
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

function getRecordsCount(ledger, hashId) {
    return new Promise((resolve, reject) => {
        ledger.dbPool_.withConnection(con => {
            con.executeQuery(qr => {
                    con.release();
                    resolve(Number(qr.getRows(1)[0][0]));
                }, e => {
                    con.release();
                    reject(e);
                },
                "select count(*) from ledger where hash = ?",
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
    assert(!await ledger.isTestnet(hashId));

    await r.markTestRecord();

    assert(await getTestRecordsCount(ledger, hashId) === 1);
    assert(await ledger.isTestnet(hashId));

    await r.markTestRecord();

    assert(await getTestRecordsCount(ledger, hashId) === 1);
    assert(await ledger.isTestnet(hashId));

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
    assertSameRecords(record, r1);
    assertSameRecords(record, r2);

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

unit.test("ledger_test: transaction", async () => {
    let ledger = await createTestLedger();

    let hash0 = HashId.of(randomBytes(64));
    let hash1 = HashId.of(randomBytes(64));
    let hash2 = HashId.of(randomBytes(64));
    let hash3 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash0);
    await ledger.findOrCreate(hash1);
    await ledger.findOrCreate(hash2);
    await ledger.findOrCreate(hash3);
    let r0 = await ledger.getRecord(hash0);
    let r1 = await ledger.getRecord(hash1);
    let r2 = await ledger.getRecord(hash2);
    let r3 = await ledger.getRecord(hash3);

    let x = await ledger.transaction(async(con) => {
        await r0.destroy(con);
        r1.state = ItemState.APPROVED;
        r2.state = ItemState.DECLINED;
        r3.state = ItemState.LOCKED_FOR_CREATION;
        await r1.save(con);
        await r2.save(con);
        await r3.save(con);
        return 55;
    });

    assert(x === 55);

    r0 = await ledger.getRecord(hash0);
    assert(r0 == null);
    await r1.reload();
    await r2.reload();
    await r3.reload();
    assert(r1.state === ItemState.APPROVED);
    assert(r2.state === ItemState.DECLINED);
    assert(r3.state === ItemState.LOCKED_FOR_CREATION);

    await ledger.close();
});

unit.test("ledger_test: rollback transaction", async () => {
    let ledger = await createTestLedger();

    let hash0 = HashId.of(randomBytes(64));
    let hash1 = HashId.of(randomBytes(64));
    let hash2 = HashId.of(randomBytes(64));
    let hash3 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash0);
    await ledger.findOrCreate(hash1);
    await ledger.findOrCreate(hash2);
    await ledger.findOrCreate(hash3);
    let r0 = await ledger.getRecord(hash0);
    let r1 = await ledger.getRecord(hash1);
    let r2 = await ledger.getRecord(hash2);
    let r3 = await ledger.getRecord(hash3);

    try {
        await ledger.transaction(async(con) => {
            await r0.destroy(con);
            r1.state = ItemState.APPROVED;
            r2.state = ItemState.DECLINED;
            r3.state = ItemState.LOCKED_FOR_CREATION;
            await r1.save(con);
            await r2.save(con);
            throw new ex.IllegalStateError("TEST_EXCEPTION");
            await r3.save(con);
        });
    } catch (e) {
        assert(e.message === "TEST_EXCEPTION");
    }

    await r0.reload();
    await r1.reload();
    await r2.reload();
    await r3.reload();
    assert(r0 != null);
    assert(r1.state !== ItemState.APPROVED);
    assert(r2.state !== ItemState.DECLINED);
    assert(r3.state !== ItemState.LOCKED_FOR_CREATION);

    await ledger.close();
});

unit.test("ledger_test: multi-threading transactions", async () => {
    let ledger = await createTestLedger();

    let hash0 = HashId.of(randomBytes(64));
    let hash1 = HashId.of(randomBytes(64));
    let hash2 = HashId.of(randomBytes(64));
    let hash3 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash0);
    await ledger.findOrCreate(hash1);
    await ledger.findOrCreate(hash2);
    await ledger.findOrCreate(hash3);
    let r0 = await ledger.getRecord(hash0);
    let r1 = await ledger.getRecord(hash1);
    let r2 = await ledger.getRecord(hash2);
    let r3 = await ledger.getRecord(hash3);

    let promises = [];

    promises.push(ledger.transaction(async(con) => {
        await r0.destroy(con);
        return 0;
    }));

    promises.push(ledger.transaction(async(con) => {
        r1.state = ItemState.APPROVED;
        await r1.save(con);
        return 11;
    }));

    promises.push(ledger.transaction(async(con) => {
        r2.state = ItemState.DECLINED;
        await r2.save(con);
        return 22;
    }));

    promises.push(ledger.transaction(async(con) => {
        r3.state = ItemState.LOCKED_FOR_CREATION;
        await r3.save(con);
        return 33;
    }));

    let results = await Promise.all(promises);

    assert(results[0] === 0);
    assert(results[1] === 11);
    assert(results[2] === 22);
    assert(results[3] === 33);

    r0 = await ledger.getRecord(hash0);
    assert(r0 == null);
    await r1.reload();
    await r2.reload();
    await r3.reload();
    assert(r1.state === ItemState.APPROVED);
    assert(r2.state === ItemState.DECLINED);
    assert(r3.state === ItemState.LOCKED_FOR_CREATION);

    await ledger.close();
});

unit.test("ledger_test: recordExpiration", async () => {
    let ledger = await createTestLedger();

    let hashId = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hashId);
    let r = await ledger.getRecord(hashId);

    assert(r.expiresAt != null);
    assert(r.expiresAt.getTime() > Date.now());

    let inFuture = new Date();
    inFuture.setTime((Math.floor(inFuture.getTime() / 1000) + 7200) * 1000);
    inFuture.setMilliseconds(0);

    let r1 = await ledger.getRecord(hashId);
    assert(r1.expiresAt.getTime() !== inFuture.getTime());

    r.expiresAt = inFuture;
    await r.save();

    await r1.reload();
    assert(r.expiresAt.getTime() === r1.expiresAt.getTime());

    r.expiresAt.setTime((Math.floor(r.expiresAt.getTime() / 1000) - 10800) * 1000);
    r.expiresAt.setMilliseconds(0);
    await r.save();

    r1 = await ledger.getRecord(hashId);
    assert(r1 == null);

    await ledger.close();
});

unit.test("ledger_test: findOrCreateAndGet", async () => {
    let ledger = await createTestLedger();

    let id = HashId.of(randomBytes(64));
    await ledger.findOrCreate(id);
    let r = await ledger.getRecord(id);

    assert(r !== null);
    assert(id.equals(r.id));
    assert(ItemState.PENDING === r.state);

    assertAlmostSame(new Date(), r.createdAt);

    // returning existing record
    await ledger.findOrCreate(id);
    let r1 = await ledger.getRecord(id);

    assertSameRecords(r, r1);

    let r2 = await ledger.getRecord(HashId.of(randomBytes(64)));
    assert(r2 == null);

    await ledger.close();
});

unit.test("ledger_test: approve", async () => {
    let ledger = await createTestLedger();

    let id = HashId.of(randomBytes(64));
    await ledger.findOrCreate(id);
    let r1 = await ledger.getRecord(id);

    assert(!r1.state.isApproved);

    await r1.approve();

    assert(ItemState.APPROVED === r1.state);
    assert(r1.state.isApproved);

    await r1.reload();

    assert(r1.state.isApproved);

    let except = false;
    try {
        await r1.approve();
    } catch (e) {
        assert(e.message === "attempt to approve record that is not pending: " + r1.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: revoke", async () => {
    let ledger = await createTestLedger();

    let id = HashId.of(randomBytes(64));
    await ledger.findOrCreate(id);
    let r1 = await ledger.getRecord(id);

    assert(!r1.state.isApproved);
    assert(r1.state.isPending);
    assert(ItemState.REVOKED !== r1.state);

    await r1.approve();
    await r1.reload();

    assert(r1.state.isApproved);
    assert(!r1.state.isPending);
    assert(ItemState.REVOKED !== r1.state);

    r1.state = ItemState.LOCKED;
    await r1.revoke();

    assert(!r1.state.isPending);
    assert(!r1.state.isApproved);
    assert(ItemState.REVOKED === r1.state);

    await ledger.close();
});

unit.test("ledger_test: saveAndTransaction", async () => {
    let ledger = await createTestLedger();

    let hash = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash);
    let r1 = await ledger.getRecord(hash);

    let hash1 = HashId.of(randomBytes(64));
    await ledger.findOrCreate(hash1);
    let r2 = await ledger.getRecord(hash1);

    await ledger.transaction(async(con) => {
        r1.state = ItemState.APPROVED;
        r2.state = ItemState.DECLINED;
        await r1.save(con);
        await r2.save(con);
    });

    await r1.reload();

    let r3 = await ledger.getRecord(r1.id);

    assert(ItemState.APPROVED === r1.state);
    assert(ItemState.APPROVED === r3.state);

    await r2.reload();

    assert(ItemState.DECLINED === r2.state);

    try {
        await ledger.transaction(async(con) => {
            r1.state = ItemState.REVOKED;
            r2.state = ItemState.DISCARDED;
            await r1.save(con);
            await r2.save(con);
            throw new ex.IllegalStateError("test_saveAndTransaction");
        });
    } catch (e) {
        assert(e.message === "test_saveAndTransaction");
    }

    await r1.reload();
    await r2.reload();

    assert(ItemState.APPROVED === r1.state);
    assert(ItemState.DECLINED === r2.state);

    await ledger.close();
});

unit.test("ledger_test: ledgerCleanupTest", async () => {
    let ledger = await createTestLedger();

    let privateKey = tk.TestKeys.getKey();
    let contract1 = Contract.fromPrivateKey(privateKey);
    await contract1.seal();

    await ledger.findOrCreate(contract1.id);
    let r1 = await ledger.getRecord(contract1.id);

    r1.expiresAt.setTime((Math.floor(Date.now() / 1000) - 1) * 1000);

    await r1.save();

    await ledger.putItem(r1, contract1, new Date((Date.now() / 1000 + 300) * 1000));

    let contract2 = Contract.fromPrivateKey(privateKey);
    await contract2.seal();

    await ledger.findOrCreate(contract2.id);
    let r2 = await ledger.getRecord(contract2.id);

    r2.expiresAt.setTime((Math.floor(Date.now() / 1000) + 30 * 24 * 3600) * 1000);

    await r2.save();
    
    await ledger.putItem(r2, contract2, new Date((Date.now() / 1000 - 1) * 1000));

    await ledger.cleanup(false);

    assert(await getRecordsCount(ledger, contract1.id) === 0);
    assert(await getRecordsCount(ledger, contract2.id) === 1);

    let count = await new Promise((resolve, reject) => {
        ledger.dbPool_.withConnection(con => {
            con.executeQuery(qr => {
                    con.release();
                    resolve(Number(qr.getRows(1)[0][0]));
                }, e => {
                    con.release();
                    reject(e);
                },
                "select count(*) from items where id in (select id from ledger where hash = ?)",
                contract2.id.digest
            );
        });
    });

    assert(count === 0);

    await ledger.close();
});