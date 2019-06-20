import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {HashId} from 'crypto'
import {randomBytes} from 'tools'
import * as tk from 'unit_tests/test_keys'
import {NodeInfo, NetConfig} from 'web'

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
    let hashId = HashId.of(randomBytes(64));
    console.log(jsonStringify(await ledger.findOrCreate(hashId, ItemState.LOCKED_FOR_CREATION, 3)));
    console.log(jsonStringify(await ledger.getLedgerSize()));
    let findRecord = await ledger.findOrCreate(hashId);
    assert(findRecord.lockedByRecordId === 3);
    assert(findRecord.state === ItemState.LOCKED_FOR_CREATION);
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
            let stateRecord = await ledger.findOrCreate(hashes[rnd]);
            if (!hashes[rnd].equals(stateRecord.id))
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

unit.test("ledger_test: simpleFindOrCreate benchmark", async () => {
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
        promises.push(new Promise(async (resolve, reject) => {
            ledger.transaction(async con => {
                let stateRecord = await ledger.simpleFindOrCreate(hashes[rnd], ItemState.PENDING, 0, con);
                if (!hashes[rnd].equals(stateRecord.id))
                    reject(new Error("findOrCreate returns wrong hashId"));
                resolve();
            });
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

    let records = await ledger.countRecords();

    //create and get
    let hash = HashId.of(randomBytes(64));
    let sr = await ledger.findOrCreate(hash);
    let record = await ledger.getRecord(hash);

    assert(await ledger.countRecords() === records + 1);

    assert(record.recordId === sr.recordId);
    assert(record.id.equals(hash));
    assert(record.id.equals(sr.id));
    assert(record.state === ItemState.PENDING);
    assert(record.lockedByRecordId === 0);
    assert(record.createdAt.getTime() / 1000 === sr.createdAt.getTime() / 1000);
    assert(record.expiresAt.getTime() / 1000 === sr.expiresAt.getTime() / 1000);
    await ledger.close();
});

unit.test("ledger_test: save", async () => {
    let ledger = await createTestLedger();

    //create and get
    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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
    let record = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    await record.destroy();

    record = await ledger.getRecord(record.id);

    assert(record == null);
    await ledger.close();
});

unit.test("ledger_test: lockForCreate", async () => {
    let ledger = await createTestLedger();

    let owner = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let other = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    let id = HashId.of(randomBytes(64));

    let r1 = await owner.lockForCreate(id);
    await r1.reload();
    assert(id.equals(r1.id));
    assert(ItemState.LOCKED_FOR_CREATION === r1.state);
    assert(owner.recordId === r1.lockedByRecordId);

    let r2 = await other.lockForCreate(id);
    assert(r2 == null);

    let r3 = await owner.lockForCreate(id);
    assert(r3 == null);

    assert(await owner.lockForCreate(other.id) == null);

    await ledger.close();
});

function getTestRecordsCount(ledger, hashId) {
    return ledger.simpleQuery("select count(*) from ledger_testrecords where hash = ?",
        x => Number(x),
        null,
        hashId.digest);
}

function getRecordsCount(ledger, hashId) {
    return ledger.simpleQuery("select count(*) from ledger where hash = ?",
        x => Number(x),
        null,
        hashId.digest);
}

unit.test("ledger_test: moveToTestnet", async () => {
    let ledger = await createTestLedger();

    let hashId = HashId.of(randomBytes(64));
    let r = await ledger.findOrCreate(hashId);

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

    let existing = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    await existing.approve();

    let r = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    let existing = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    await existing.approve();

    let existing2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    await existing2.approve();

    let r =await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    let r = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    let r1 = await r.lockForCreate(HashId.of(randomBytes(64)));

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

    let r0 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r3 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    r0 = await ledger.getRecord(r0.id);
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

    let r0 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r3 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    let r0 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r3 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    r0 = await ledger.getRecord(r0.id);
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
    let r = await ledger.findOrCreate(hashId);

    assert(r.expiresAt != null);
    assert(r.expiresAt.getTime() > Date.now());

    let inFuture = new Date();
    inFuture.setHours(inFuture.getHours() + 2);
    inFuture.setMilliseconds(0);

    let r1 = await ledger.getRecord(hashId);
    assert(r1.expiresAt.getTime() !== inFuture.getTime());

    r.expiresAt = inFuture;
    await r.save();

    await r1.reload();
    assert(r.expiresAt.getTime() === r1.expiresAt.getTime());

    r.expiresAt.setHours(r.expiresAt.getHours() - 3);
    r.expiresAt.setMilliseconds(0);
    await r.save();

    r1 = await ledger.getRecord(hashId);
    assert(r1 == null);

    await ledger.close();
});

unit.test("ledger_test: findOrCreateAndGet", async () => {
    let ledger = await createTestLedger();

    let id = HashId.of(randomBytes(64));
    let r = await ledger.findOrCreate(id);

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

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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
        assert(e.message === "attempt to approve record from wrong state: " + r1.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: revoke", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

    let except = false;
    try {
        await r1.revoke();
    } catch (e) {
        assert(e.message === "attempt to revoke record from wrong state: " + r1.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: decline", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    assert(ItemState.DECLINED !== r1.state);

    await r1.decline();

    assert(ItemState.DECLINED === r1.state);

    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    await r2.approve();

    let except = false;
    try {
        await r2.decline();
    } catch (e) {
        assert(e.message === "attempt to decline record from wrong state: " + r2.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: setUndefined", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    assert(ItemState.UNDEFINED !== r1.state);

    await r1.setUndefined();

    assert(ItemState.UNDEFINED === r1.state);

    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    await r2.approve();

    let except = false;
    try {
        await r2.setUndefined();
    } catch (e) {
        assert(e.message === "attempt setUndefined record from wrong state: " + r2.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: setPendingPositive", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    assert(ItemState.PENDING_POSITIVE !== r1.state);

    await r1.setPendingPositive();

    assert(ItemState.PENDING_POSITIVE === r1.state);

    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    await r2.decline();

    let except = false;
    try {
        await r2.setPendingPositive();
    } catch (e) {
        assert(e.message === "attempt setPendingPositive record from wrong state: " + r2.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: setPendingNegative", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    assert(ItemState.PENDING_NEGATIVE !== r1.state);

    await r1.setPendingNegative();

    assert(ItemState.PENDING_NEGATIVE === r1.state);

    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    await r2.decline();

    let except = false;
    try {
        await r2.setPendingNegative();
    } catch (e) {
        assert(e.message === "attempt setPendingNegative record from wrong state: " + r2.state.val);
        except = true;
    }

    assert(except);

    await ledger.close();
});

unit.test("ledger_test: saveAndTransaction", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

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

unit.test("ledger_test: getItemTest", async () => {
    let ledger = await createTestLedger();

    let contract = Contract.fromPrivateKey(tk.TestKeys.getKey());
    await contract.seal();

    let r = await ledger.findOrCreate(contract.id);

    await ledger.putItem(r, contract, new Date((Date.now() / 1000 + 300) * 1000));
    let gottenContract = await ledger.getItem(r);

    assert(gottenContract.sealedBinary.equals(contract.sealedBinary));

    await ledger.close();
});

unit.test("ledger_test: ledgerCleanupTest", async () => {
    let ledger = await createTestLedger();

    let privateKey = tk.TestKeys.getKey();
    let contract1 = Contract.fromPrivateKey(privateKey);
    await contract1.seal();

    let r1 = await ledger.findOrCreate(contract1.id);

    r1.expiresAt.setTime((Math.floor(Date.now() / 1000) - 1) * 1000);

    await r1.save();

    await ledger.putItem(r1, contract1, new Date((Date.now() / 1000 + 300) * 1000));

    let contract2 = Contract.fromPrivateKey(privateKey);
    await contract2.seal();

    let r2 = await ledger.findOrCreate(contract2.id);

    r2.expiresAt.setTime((Math.floor(Date.now() / 1000) + 300) * 1000);

    await r2.save();
    
    await ledger.putItem(r2, contract2, new Date((Date.now() / 1000 - 1) * 1000));

    await ledger.cleanup(false);

    assert(await getRecordsCount(ledger, contract1.id) === 0);
    assert(await getRecordsCount(ledger, contract2.id) === 1);

    let count = await ledger.simpleQuery("select count(*) from items where id in (select id from ledger where hash = ?)",
        x => Number(x),
        null,
        contract2.id.digest);

    assert(count === 0);

    await ledger.close();
});

unit.test("ledger_test: paymentSaveGetTest", async () => {
    let ledger = await createTestLedger();

    await ledger.simpleUpdate("delete from payments_summary;");

    let now  = Date.now();
    let dateNow = new Date();
    let year = dateNow.getUTCFullYear();
    let month = dateNow.getUTCMonth();
    if (month === 0) {
        month = 11;
        year--;
    } else
        month--;

    let dateAfter = Date.UTC(year, month);
    let dateTime = dateAfter;
    let i = 0;
    while (dateTime < now + 1000) {
        await ledger.savePayment(100, new Date(dateTime));
        await ledger.savePayment(12, new Date(dateTime));
        dateTime += 24 * 3600000;
        i++;
    }

    let payments = await ledger.getPayments(new Date(dateAfter));
    let pays = 0;
    for (let [date, pay] of payments) {
        assertSilent(pay === 112);
        assertSilent(date >= dateAfter / 1000 && date <= now / 1000);
        pays += pay;
    }

    assert(pays === 112 * i);

    await ledger.close();
});

unit.test("ledger_test: findBadReferencesOfTest", async () => {
    let ledger = await createTestLedger();

    let r1 = await ledger.findOrCreate(HashId.of(randomBytes(64)));
    let r2 = await ledger.findOrCreate(HashId.of(randomBytes(64)));

    await ledger.transaction(async(con) => {
        r1.state = ItemState.APPROVED;
        r2.state = ItemState.DECLINED;
        await r1.save(con);
        await r2.save(con);
    });

    let ids = await ledger.findBadReferencesOf(new t.GenericSet([r1.id, r2.id]));

    assert(ids.size === 1);
    assert(ids.has(r2.id));

    await ledger.close();
});

/*unit.test("ledger_test: configTest", async () => {
    let ledger = await createTestLedger();

    let nc = new NetConfig();
    let pk = tk.TestKeys.getKey();

    for (let i = 0; i < 10; i++)
        nc.addNode(NodeInfo.withParameters(tk.TestKeys.getKey().publicKey, i, "node-" + i,
            "127.0.0.1", "192.168.1.101", 7001, 8001, 9001));

    await ledger.saveConfig(nc.getInfo(7), nc, pk);

    let pk10 = tk.TestKeys.getKey().publicKey;
    await ledger.addNode(NodeInfo.withParameters(pk10, 10, "node-10",
        "127.0.0.100", "192.168.1.111", 17001, 18001, 19001));

    await ledger.removeNode(nc.getInfo(2));

    let loaded = await ledger.loadConfig();

    assert(loaded.nodeKey.equals(pk));
    assert(loaded.myInfo.number === 7);
    assert(!loaded.netConfig.find(2));

    loaded.netConfig.toList().forEach(ni => {
        if (ni.number === 10) {
            assertSilent(ni.publicKey.equals(pk10));
            assertSilent(ni.nodeAddress.host === "127.0.0.100");
            assertSilent(ni.nodeAddress.port === 17001);
            assertSilent(ni.clientAddress.host === "192.168.1.111");
            assertSilent(ni.clientAddress.port === 18001);
            assertSilent(ni.serverAddress.host === "127.0.0.100");
            assertSilent(ni.serverAddress.port === 19001);
            assertSilent(ni.name === "node-10");
            assertSilent(ni.publicHost === "192.168.1.111");

        } else {
            assertSilent(ni.publicKey.equals(nc.getInfo(ni.number).publicKey));
            assertSilent(ni.nodeAddress.host === nc.getInfo(ni.number).nodeAddress.host);
            assertSilent(ni.nodeAddress.port === nc.getInfo(ni.number).nodeAddress.port);
            assertSilent(ni.clientAddress.host === nc.getInfo(ni.number).clientAddress.host);
            assertSilent(ni.clientAddress.port === nc.getInfo(ni.number).clientAddress.port);
            assertSilent(ni.serverAddress.host === nc.getInfo(ni.number).serverAddress.host);
            assertSilent(ni.serverAddress.port === nc.getInfo(ni.number).serverAddress.port);
            assertSilent(ni.name === nc.getInfo(ni.number).name);
            assertSilent(ni.publicHost === nc.getInfo(ni.number).publicHost);

            if (ni.number === 7) {
                assertSilent(ni.publicKey.equals(loaded.myInfo.publicKey));
                assertSilent(ni.nodeAddress.host === loaded.myInfo.nodeAddress.host);
                assertSilent(ni.nodeAddress.port === loaded.myInfo.nodeAddress.port);
                assertSilent(ni.clientAddress.host === loaded.myInfo.clientAddress.host);
                assertSilent(ni.clientAddress.port === loaded.myInfo.clientAddress.port);
                assertSilent(ni.serverAddress.host === loaded.myInfo.serverAddress.host);
                assertSilent(ni.serverAddress.port === loaded.myInfo.serverAddress.port);
                assertSilent(ni.name === loaded.myInfo.name);
                assertSilent(ni.publicHost === loaded.myInfo.publicHost);
            }
        }
    });

    await ledger.close();
});*/