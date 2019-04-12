/**
 * @module ledger
 */

import * as db from 'pg_driver'
import * as trs from 'timers'
import {HashId, PrivateKey} from 'crypto'
import {NodeInfo, NetConfig} from 'udp_adapter'

const StateRecord = require("staterecord").StateRecord;
const ItemState = require("itemstate").ItemState;
const t = require("tools");
const ex = require("exceptions");

class LedgerException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

/**
 * The basic SQL-based ledger.
 */
class Ledger {

    constructor(connectionString) {
        this.MAX_CONNECTIONS = 64;

        this.cachedRecords = new t.GenericMap();
        this.cachedRecordsById = new t.GenericMap();
        this.useCache = true;

        this.bufParams = {
            findOrCreate_insert: {enabled: true, bufSize: 200, delayMillis: 40, buf: new Map(), bufInProc: new Map(), ts: new Date().getTime()},
            findOrCreate_select: {enabled: true, bufSize: 400, delayMillis: 40, buf: new Map(), ts: new Date().getTime()},
        };

        this.timers_ = [];
        if (this.bufParams.findOrCreate_insert.enabled)
            this.addTimer(this.bufParams.findOrCreate_insert.delayMillis, this.findOrCreate_buffered_insert_processBuf.bind(this));
        if (this.bufParams.findOrCreate_select.enabled)
            this.addTimer(this.bufParams.findOrCreate_select.delayMillis, this.findOrCreate_buffered_select_processBuf.bind(this));

        //db.connect is synchronous inside
        db.connect(connectionString, (pool) => {
            this.dbPool_ = pool;
        }, (e) => {
            throw new LedgerException("connect.onError: " + e);
        }, this.MAX_CONNECTIONS);
    }

    // Cache methods
    getFromCache(itemId) {
        if (this.useCache) {
            let record = this.cachedRecords.get(itemId);
            if (record == null)
                return null;
            else
                return record;
        } else
            return null;
    }

    getFromCacheById(recordId) {
        if (this.useCache) {
            let record = this.cachedRecordsById.get(recordId);
            if (record == null)
                return null;
            else
                return record;
        } else
            return null;
    }

    putToCache(record) {
        if (this.useCache) {
            this.cachedRecords.set(record.id, record);
            this.cachedRecordsById.set(record.recordId, record);
        }
    }


    addTimer(delay, block) {
        let i = this.timers_.length;
        let f = () => {
            block();
            this.timers_[i] = trs.timeout(delay, f);
        };
        this.timers_[i] = trs.timeout(delay, f);
    }

    simpleUpdate(sql, ...params) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeUpdate(qr => {
                        con.release();
                        resolve();
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    sql,
                    ...params
                );
            });
        });
    }

    simpleQuery(sql, processValue, ...params) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
                        let row = qr.getRows(1)[0];
                        con.release();

                        let value = null;
                        if (row != null && row[0] != null)
                            value = row[0];

                        if (processValue != null)
                            resolve(processValue(value));
                        else
                            resolve(value);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    sql,
                    ...params
                );
            });
        });
    }

    /**
     * Get the record by its id.
     *
     * @param {HashId} itemId - ItemId to retrieve.
     * @return {Promise<StateRecord|null>} record or null if not found.
     */
    getRecord(itemId) {
        return new Promise(async(resolve, reject) => {
            let cached = this.getFromCache(itemId);
            if (cached != null) {
                if (cached.isExpired()) {
                    await cached.destroy();
                    resolve(null);
                } else
                    resolve(cached);

            } else
                this.dbPool_.withConnection(con => {
                    con.executeQuery(async(qr) => {
                            let row = qr.getRows(1)[0];
                            con.release();

                            if (row != null) {
                                let record = StateRecord.initFrom(this, row);

                                if (record.isExpired()) {
                                    await record.destroy();
                                    resolve(null);
                                } else {
                                    this.putToCache(record);
                                    resolve(record);
                                }
                            } else
                                resolve(null);

                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "SELECT * FROM ledger WHERE hash = ? limit 1",
                        itemId.digest
                    );
                });
        });
    }

    /**
     * Create a record in {@see ItemState#LOCKED_FOR_CREATION} state locked by creatorRecordId. Does not check
     * anything, the business logic of it is in the {@see StateRecord}. Still, if a database logic prevents creation of
     * a lock record (e.g. hash is already in use), it must return null.
     *
     * @param {number} creatorRecordId - Record that want to create new item.
     * @param {HashId} newItemHashId - New item hash.
     * @return {Promise<StateRecord|null>} ready saved instance or null if it can not be created (e.g. already exists).
     */
    createOutputLockRecord(creatorRecordId, newItemHashId) {
        let r = new StateRecord(this);
        r.state = ItemState.LOCKED_FOR_CREATION;
        r.lockedByRecordId = creatorRecordId;

        if (r.id != null && !r.id.equals(newItemHashId))
            throw new ex.IllegalStateError("can't change id of StateRecord");

        r.id = newItemHashId;

        return r.save();
    }

    /**
     * Create new record for a given id and set it to the PENDING state. Normally, it is used to create new root
     * documents. If the record exists, it returns it. If the record does not exists, it creates new one with {@link
     * ItemState#PENDING} state. The operation must be implemented as atomic.
     *
     * @param {HashId} itemId - HashId to register, or null if it is already in use.
     * @return {StateRecord} found or created {@link StateRecord}.
     */
    findOrCreate(itemId) {
        return this.findOrCreate_buffered_insert(itemId).then(() => {
            return this.findOrCreate_buffered_select(itemId);
        }).catch(reason => {
            console.error(reason);
        });
    }

    findOrCreate_buffered_insert(itemId) {
        if (this.bufParams.findOrCreate_insert.enabled) {
            let buf = this.bufParams.findOrCreate_insert.buf;
            if (this.bufParams.findOrCreate_insert.bufInProc.has(itemId.base64))
                buf = this.bufParams.findOrCreate_insert.bufInProc;

            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});

            if (buf.has(itemId.base64)) {
                let item = buf.get(itemId.base64);
                item[1].push(resolver);
                item[2].push(rejecter);
            } else {
                buf.set(itemId.base64, [itemId, [resolver], [rejecter]]);
            }

            this.findOrCreate_buffered_insert_processBuf();
            return promise;
        } else {
            return new Promise((resolve, reject) => {
                this.dbPool_.withConnection(con => {
                    con.executeUpdate(qr => {
                            con.release();
                            resolve();
                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES (?, 1, extract(epoch from timezone('GMT', now())), extract(epoch from timezone('GMT', now() + interval '5 minute')), NULL) ON CONFLICT (hash) DO NOTHING;",
                        itemId.digest
                    );
                });
            });
        }
    }

    findOrCreate_buffered_insert_processBuf() {
        let processBuf = () => {
            let arrOfBufs = [];
            let map = new Map();
            for (let [k,v] of this.bufParams.findOrCreate_insert.buf) {
                this.bufParams.findOrCreate_insert.bufInProc.set(k, v);
                map.set(k, v);
                if (map.size >= this.bufParams.findOrCreate_insert.bufSize) {
                    arrOfBufs.push(map);
                    map = new Map();
                }
            }
            this.bufParams.findOrCreate_insert.buf = new Map();
            if (map.size > 0) {
                arrOfBufs.push(map);
                map = new Map();
            }
            for (let i = 0; i < arrOfBufs.length; ++i) {
                let map = arrOfBufs[i];

                this.dbPool_.withConnection(con => {
                    let queryValues = [];
                    let params = [];
                    for (let [k,item] of map) {
                        // queryValues.push("(?, 1, extract(epoch from timezone('GMT', now())), extract(epoch from timezone('GMT', now() + interval '5 minute')), NULL)");
                        queryValues.push("(?,1,?,?,NULL)");
                        params.push(item[0].digest);
                        params.push(Math.floor(new Date().getTime()/1000));
                        params.push(Math.floor(new Date().getTime()/1000) + 5*60 + Math.floor(Math.random()*10));
                    }
                    let queryString = "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES "+queryValues.join(",")+" ON CONFLICT (hash) DO NOTHING;";
                    con.executeUpdate(affectedRows => {
                        con.release();
                        for (let [k,v] of map) {
                            this.bufParams.findOrCreate_insert.bufInProc.delete(k);
                            v[1].forEach(v => v()); // call resolvers
                        }
                    }, e => {
                        con.release();
                        for (let [k,v] of map) {
                            this.bufParams.findOrCreate_insert.bufInProc.delete(k);
                            v[2].forEach(v => v(e)); // call rejecters
                        }
                    }, queryString, ...params);
                });
            }
        };

        let now = new Date().getTime();
        if ((now - this.bufParams.findOrCreate_insert.ts >= this.bufParams.findOrCreate_insert.delayMillis) ||
            (this.bufParams.findOrCreate_insert.buf.size >= this.bufParams.findOrCreate_insert.bufSize)) {
            processBuf();
            this.bufParams.findOrCreate_insert.ts = now;
        } else {
            // waiting for future messages, do nothing
        }
    }

    findOrCreate_buffered_select(itemId) {
        if (this.bufParams.findOrCreate_select.enabled) {
            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});
            if (this.bufParams.findOrCreate_select.buf.has(itemId.base64)) {
                let item = this.bufParams.findOrCreate_select.buf.get(itemId.base64);
                item[1].push(resolver);
                item[2].push(rejecter);
            } else {
                this.bufParams.findOrCreate_select.buf.set(itemId.base64, [itemId, [resolver], [rejecter]]);
            }
            this.findOrCreate_buffered_select_processBuf();
            return promise;
        } else {
            return new Promise((resolve, reject) => {
                this.dbPool_.withConnection(con => {
                    con.executeQuery(qr => {
                            let row = qr.getRows(1)[0];
                            con.release();
                            resolve(row);
                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "SELECT * FROM ledger WHERE hash=? limit 1;",
                        itemId.digest
                    );
                });
            });
        }
    }

    findOrCreate_buffered_select_processBuf() {
        let processBuf = () => {
            let arrOfBufs = [];
            let map = new Map();
            for (let [k,v] of this.bufParams.findOrCreate_select.buf) {
                map.set(k, v);
                if (map.size >= this.bufParams.findOrCreate_select.bufSize) {
                    arrOfBufs.push(map);
                    map = new Map();
                }
            }
            if (map.size > 0)
                arrOfBufs.push(map);
            this.bufParams.findOrCreate_select.buf = new Map();
            for (let i = 0; i < arrOfBufs.length; ++i) {
                let map = arrOfBufs[i];

                this.dbPool_.withConnection(con => {
                    let queryValues = [];
                    let params = [];
                    for (let [k,v] of map) {
                        queryValues.push("?");
                        params.push(v[0].digest);
                    }
                    let queryString = "SELECT * FROM ledger WHERE hash IN ("+queryValues.join(",")+") LIMIT "+params.length+";";
                    con.executeQuery(qr => {
                        let rows = qr.getRows(0);
                        let names = qr.getColNamesMap();
                        con.release();
                        for (let j = 0; j < rows.length; ++j) {
                            let resolversArr = map.get(crypto.HashId.withDigest(rows[j][names["hash"]]).base64)[1];
                            for (let k = 0; k < resolversArr.length; ++k)
                                resolversArr[k](rows[j]); // call resolver
                        }
                    }, e => {
                        con.release();
                        for (let [k,v] of map)
                            v[2](e); // call rejecter

                    }, queryString, ...params);
                });
            }
        };

        let now = new Date().getTime();
        if ((now - this.bufParams.findOrCreate_select.ts >= this.bufParams.findOrCreate_select.delayMillis) ||
            (this.bufParams.findOrCreate_select.buf.size >= this.bufParams.findOrCreate_select.bufSize)) {
            processBuf();
            this.bufParams.findOrCreate_select.ts = now;
        } else {
            // waiting for future messages, do nothing
        }
    }

    /**
     * Shortcut method: check that record exists and its state returns {@link ItemState}. Check it to
     * ensure its meaning.
     *
     * @param {HashId} itemId - HashId for checking item.
     * @return true if it is.
     */
    async isApproved(itemId) {
        let r = await this.getRecord(id);
        return r != null && r.state.isApproved;
    }

    /**
     * Perform a callable in a transaction. If the callable throws any exception, the transaction should be rolled back
     * to its initial state. Blocks until the callable returns, and returns what the callable returns. If an exception
     * is thrown by the callable, the transaction is rolled back and the exception will be rethrown unless it was a
     * instance, which just rollbacks the transaction, in which case it always return null.
     *
     * @param block to execute
     * @return {Promise} null if transaction is rolled back throwing a exception, otherwise what callable
     * returns.
     */
    transaction(block) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(async(con) => {
                con.executeUpdate(affectedRows => {},
                    e => {
                        con.release();
                        reject(e);
                    },
                    "BEGIN;"
                );

                let result = null;

                try {
                    result = await block(con);
                } catch (err) {

                    con.executeQuery(qr => {
                            con.release();
                            reject(err);
                        },
                        e => {
                            con.release();
                            reject(e);
                        },
                        "ROLLBACK;"
                    );

                    return;
                }

                con.executeUpdate(affectedRows => {
                        con.release();
                        resolve(result);
                    },
                    e => {
                        con.release();
                        reject(e);
                    },
                    "COMMIT;"
                );
            });
        });
    }

    /**
     * Destroy the record and free space in the ledger.
     *
     * @param {StateRecord} record - StateRecord to destroy.
     * @param {db.SqlDriverConnection} connection - transaction connection for destroy record. Optional.
     * @return {Promise} resolved when record destroyed.
     */
    destroy(record, connection) {
        if (record.recordId === 0)
            throw new ex.IllegalStateError("can't destroy record without recordId");

        this.cachedRecords.delete(record.id);
        this.cachedRecordsById.delete(record.recordId);

        if (connection !== undefined)
            return this.transactionDestroy(record, connection);

        return this.simpleUpdate("DELETE FROM items WHERE id = ?;", record.recordId)
            .then(() => {
                return this.simpleUpdate("DELETE FROM ledger WHERE id = ?;", record.recordId);
            });
    }

    /**
     * Destroy the record in the ledger in opened transaction.
     *
     * @param {StateRecord} record - StateRecord to destroy.
     * @param {db.SqlDriverConnection} connection - transaction connection for destroy record.
     * @return {Promise} resolved when record destroyed.
     */
    transactionDestroy(record, connection) {
        return new Promise((resolve, reject) => {
            connection.executeUpdate(qr => {
                    resolve();
                }, e => {
                    reject(e);
                },
                "DELETE FROM items WHERE id = ?;",
                record.recordId
            );
        }).then(() => {
            return new Promise((resolve, reject) => {
                connection.executeUpdate(qr => {
                        resolve();
                    }, e => {
                        reject(e);
                    },
                    "DELETE FROM ledger WHERE id = ?;",
                    record.recordId
                );
            });
        });
    }

    /**
     * Save a record into the ledger.
     *
     * @param {StateRecord} record - StateRecord to save.
     * @param {db.SqlDriverConnection} connection - transaction connection for save record. Optional.
     * @return {Promise<StateRecord>} resolved when record saved.
     */
    save(record, connection) {
        if (record.ledger == null) {
            record.ledger = this;
        } else if (record.ledger !== this)
            throw new ex.IllegalStateError("can't save with a different ledger (make a copy!)");

        if (connection != null)
            return this.transactionSave(record, connection);

        if (record.recordId === 0)
            return new Promise((resolve, reject) => {
                this.dbPool_.withConnection(con => {
                    con.executeQuery(qr => {
                            let row = qr.getRows(1)[0];
                            con.release();

                            if (row != null && row[0] != null)
                                record.recordId = row[0];

                            this.putToCache(record);

                            resolve(record);
                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "insert into ledger(hash, state, created_at, expires_at, locked_by_id) values(?,?,?,?,?) RETURNING id;",
                        record.id.digest,
                        record.state.ordinal,
                        Math.floor(record.createdAt.getTime() / 1000),
                        Math.floor(record.expiresAt.getTime() / 1000),
                        record.lockedByRecordId
                    );
                });
            });
        else
            return this.simpleUpdate("update ledger set state=?, expires_at=?, locked_by_id=? where id=?",
                record.state.ordinal,
                Math.floor(record.expiresAt.getTime() / 1000),
                record.lockedByRecordId,
                record.recordId);
    }

    /**
     * Save a record into the ledger in opened transaction.
     *
     * @param {StateRecord} record - StateRecord to save.
     * @param {db.SqlDriverConnection} connection - transaction connection for save record.
     * @return {Promise<StateRecord>} resolved when record saved.
     */
    transactionSave(record, connection) {
        if (record.recordId === 0)
            return new Promise((resolve, reject) => {
                connection.executeQuery(qr => {
                        let row = qr.getRows(1)[0];

                        if (row != null && row[0] != null)
                            record.recordId = row[0];

                        this.putToCache(record);

                        resolve(record);
                    }, e => {
                        reject(e);
                    },
                    "insert into ledger(hash, state, created_at, expires_at, locked_by_id) values(?,?,?,?,?) RETURNING id;",
                    record.id.digest,
                    record.state.ordinal,
                    Math.floor(record.createdAt.getTime() / 1000),
                    Math.floor(record.expiresAt.getTime() / 1000),
                    record.lockedByRecordId
                );
            });
        else
            return new Promise((resolve, reject) => {
                connection.executeUpdate(qr => {
                        resolve(record);
                    }, e => {
                        reject(e);
                    },
                    "update ledger set state=?, expires_at=?, locked_by_id=? where id=?",
                    record.state.ordinal,
                    Math.floor(record.expiresAt.getTime() / 1000),
                    record.lockedByRecordId,
                    record.recordId
                );
            });
    }

    /**
     * Refresh record.
     *
     * @param {StateRecord} record - StateRecord to reload.
     * @return {Promise<StateRecord|null>} reloaded record or null if record is expired.
     */
    reload(record) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let row = qr.getRows(1)[0];
                        con.release();

                        if (row != null) {
                            record = StateRecord.initFrom(this, row);
                            if (record.isExpired()) {
                                await record.destroy();
                                resolve(null);
                            } else
                                resolve(record);
                        } else
                            resolve(null);

                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT * FROM ledger WHERE hash = ? limit 1",
                    record.id.digest
                );
            });
        });
    }

    /**
     * Releases all connections to database.
     */
    async close() {
        this.dbPool_.close();
        for (let i = 0; i < this.timers_.length; ++i)
            trs.clearTimeout(this.timers_[i]);

        //wait for delayed timer callbacks
        let delay = 50;
        Object.keys(this.bufParams).forEach(key => {
            if ("delayMillis" in this.bufParams[key])
                if (delay < this.bufParams[key].delayMillis)
                    delay = this.bufParams[key].delayMillis;
        });
        await sleep(200+delay*1.5);
    }

    /**
     * Get count of records in Ledger.
     *
     * @return {Promise<Number>} count of records.
     */
    countRecords() {
        return this.simpleQuery("SELECT COUNT(*) FROM ledger",
            x => Number(x));
    }

    /**
     * Get the record that owns the lock. This method should only return the record, not analyze it or somehow process. Still
     * it never returns expired records. Note that <b>caller must clear the lock</b> if this method returns null.
     *
     * @param {StateRecord} record - Locked record.
     * @return {Promise<StateRecord|null>} the record or null if none found.
     */
    getLockOwnerOf(record) {
        return new Promise((resolve, reject) => {
            let cached = this.getFromCacheById(record.lockedByRecordId);
            if (cached != null)
                resolve(cached);
            else
                this.dbPool_.withConnection(con => {
                    con.executeQuery(async(qr) => {
                            let row = qr.getRows(1)[0];
                            con.release();

                            if (row != null) {
                                let record = StateRecord.initFrom(this, row);

                                if (record.isExpired()) {
                                    await record.destroy();
                                    resolve(null);
                                } else {
                                    this.putToCache(record);
                                    resolve(record);
                                }
                            } else
                                resolve(null);

                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "SELECT * FROM ledger WHERE id = ? limit 1",
                        record.lockedByRecordId
                    );
                });
        });
    }

    /**
     * Get an Object, the keys of which are the states of the Ledger items,
     * and the values are the number of items that are in this state.
     *
     * @param {Date} createdAfter=0 -Creation time, those elements that are created after this time are taken into account.
     * @return {Promise<Object>}
     */
    getLedgerSize(createdAfter = 0) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
                        let res = {};
                        let rows = qr.getRows(0);
                        rows.forEach(r => res[r[1]] = r[0]);
                        con.release();
                        resolve(res);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "select count(id), state from ledger where created_at >= ? group by state",
                    createdAfter
                );
            });
        });
    }

    /**
     * Save the payment (the amount on a specific date) for the subsequent collection of statistics.
     *
     * @param {number} amount - Amount of payment.
     * @param {Date} date - Payment date.
     * @return {Promise}
     */
    savePayment(amount, date) {
        return this.simpleUpdate("insert into payments_summary (amount,date) VALUES (?,?) ON CONFLICT (date) DO UPDATE SET amount = payments_summary.amount + excluded.amount",
            amount,
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
    }

    /**
     * Get all payments aggregated by day from a specific date.
     *
     * @param {Date} fromDate - Specific date.
     * @return {Promise<Map>}
     */
    getPayments(fromDate) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
                        let payments = new Map();
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null)
                                    payments.set(rows[i][0], rows[i][1]);
                        }

                        con.release();
                        resolve(payments);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT date, amount FROM payments_summary where date >= ?;",
                    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()) / 1000
                );
            });
        });
    }

    /**
     * Marks the specified item as a test.
     *
     * @param {HashId} itemId - Item HashId.
     * @return {Promise}.
     */
    markTestRecord(itemId) {
        return this.simpleUpdate("insert into ledger_testrecords(hash) values(?) on conflict do nothing;", itemId.digest);
    }

    /**
     * Check the specified item is a test.
     *
     * @param {HashId} itemId - Item HashId.
     * @return {Promise<Boolean>}.
     */
    isTestnet(itemId) {
        return this.simpleQuery("select exists(select 1 from ledger_testrecords where hash=?)",
            x => Boolean(x),
            itemId.digest);
    }

    updateSubscriptionInStorage(subscriptionId, expiresAt) {
        return this.simpleUpdate("UPDATE contract_subscription SET expires_at = ? WHERE id = ?",
            Math.floor(expiresAt.getTime() / 1000),
            subscriptionId);
    }

    updateStorageExpiresAt(storageId, expiresAt) {
        return this.simpleUpdate("UPDATE contract_storage SET expires_at = ? WHERE id = ?",
            Math.floor(expiresAt.getTime() / 1000),
            storageId);
    }

    saveFollowerEnvironment(environmentId, expiresAt, mutedAt, spent, startedCallbacks) {
        return this.simpleUpdate("INSERT INTO follower_environments (environment_id, expires_at, muted_at, spent_for_callbacks, started_callbacks) " +
            "VALUES (?,?,?,?,?) ON CONFLICT (environment_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, " +
            "muted_at = EXCLUDED.muted_at, spent_for_callbacks = EXCLUDED.spent_for_callbacks, started_callbacks = EXCLUDED.started_callbacks",
            environmentId,
            Math.floor(expiresAt.getTime() / 1000),
            Math.floor(mutedAt.getTime() / 1000),
            spent,
            startedCallbacks);
    }

    updateNameRecord(nameRecordId, expiresAt) {
        return this.simpleUpdate("UPDATE name_storage SET expires_at = ? WHERE id = ?",
            Math.floor(expiresAt.getTime() / 1000),
            nameRecordId);
    }

    saveEnvironment(environment) {}

    /**
     * Find bad (not approved) items in ledger by set of IDs.
     *
     * @param {Set<HashId>} ids - set of HashId`s.
     * @return {Promise<Set<HashId>>} - set of IDs not approved items.
     */
    findBadReferencesOf(ids) {
        if (ids.size < 1)
            throw new ex.IllegalArgumentError("Error findBadReferencesOf: empty IDs set");

        let query = "SELECT hash FROM ledger WHERE hash IN (?";
        for (let i = 1; i < ids.size; i++)
            query += ",?";

        query += ") AND state = " + ItemState.APPROVED.ordinal;

        let arr = [];
        for (let id of ids)
            arr.push(id.digest);

        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null)
                                    ids.delete(crypto.HashId.withDigest(rows[i][0]));
                        }

                        con.release();
                        resolve(ids);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    query,
                    ...arr
                );
            });
        });
    }

    async saveConfig(myInfo, netConfig, nodeKey) {
        await this.simpleUpdate("delete from config;");

        for (let nodeInfo of netConfig.toList()) {
            let sqlText;
            let params = [nodeInfo.clientAddress.port,
                nodeInfo.serverAddress.port,
                nodeInfo.nodeAddress.port,
                nodeInfo.number,
                nodeInfo.name,
                nodeInfo.publicHost,
                nodeInfo.clientAddress.host,
                nodeInfo.publicKey.packed];

            if (nodeInfo.number === myInfo.number) {
                sqlText = "insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key,private_key) values(?,?,?,?,?,?,?,?,?);";
                params.push(nodeKey.packed);
            } else
                sqlText = "insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key) values(?,?,?,?,?,?,?,?);";

            await this.simpleUpdate(sqlText, ...params);
        }
    }

    loadConfig() {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let result = {
                            myInfo : null,
                            netConfig : null,
                            nodeKey : null
                        };
                        let nodeInfos = [];

                        let names = qr.getColNamesMap();
                        let count = qr.getRowsCount();

                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null) {
                                    let nodeInfo = NodeInfo.withParameters(rows[i][names["public_key"]],
                                        rows[i][names["node_number"]],
                                        rows[i][names["node_name"]],
                                        rows[i][names["host"]],
                                        rows[i][names["public_host"]],
                                        rows[i][names["udp_server_port"]],
                                        rows[i][names["http_client_port"]],
                                        rows[i][names["http_server_port"]]);

                                    nodeInfos.push(nodeInfo);

                                    let packedKey = rows[i][names["private_key"]];
                                    if (packedKey != null) {
                                        result.myInfo = nodeInfo;
                                        result.nodeKey = new crypto.PrivateKey(packedKey);
                                    }
                                }
                        }

                        con.release();

                        if (nodeInfos.length === 0)
                            throw new LedgerException("config not found");

                        result.netConfig = new NetConfig();
                        for (let i = 0; i < nodeInfos.length; i++)
                            result.netConfig.addNode(nodeInfos[i]);

                        resolve(result);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT * FROM config;"
                );
            });
        });
    }

    addNode(nodeInfo) {
        return this.simpleUpdate("insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key) values(?,?,?,?,?,?,?,?);",
            nodeInfo.clientAddress.port,
            nodeInfo.serverAddress.port,
            nodeInfo.nodeAddress.port,
            nodeInfo.number,
            nodeInfo.name,
            nodeInfo.publicHost,
            nodeInfo.clientAddress.host,
            nodeInfo.publicKey.packed);
    }

    removeNode(nodeInfo) {
        return this.simpleUpdate("delete from config where node_number = ?;",
            nodeInfo.number);
    }

    findUnfinished() {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let map = new t.GenericMap();
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null) {
                                    let record = StateRecord.initFrom(this, rows[i]);

                                    if (record.isExpired())
                                        await record.destroy();
                                    else
                                        map.set(record.id, record);
                                }
                        }

                        con.release();
                        resolve(map);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "select * from sr_find_unfinished()"
                );
            });
        });
    }

    getItem(record) {
        return this.simpleQuery("select packed from items where id = ?",
            x => Contract.fromPackedTransaction(x),
            record.recordId);
    }

    putItem(record, item, keepTill) {
        if (!item instanceof Contract)
            return;

        return this.simpleUpdate("insert into items(id,packed,keepTill) values(?,?,?);",
            record.recordId,
            item.getPackedTransaction(),
            Math.floor(keepTill.getTime() / 1000));
    }

    getKeepingItem(itemId) {
        return this.simpleQuery("select packed from keeping_items where hash = ? limit 1",
            null,
            itemId.digest);
    }

    putKeepingItem(record, item) {
        if (!item instanceof Contract)
            return;

        return this.simpleUpdate("insert into keeping_items (id,hash,origin,parent,packed) values(?,?,?,?,?);",
            record != null ? record.recordId : null,
            item.id.digest,
            item.origin.digest,
            item.parent != null ? item.parent.digest : null,
            item.getPackedTransaction()
        );

    }

    getEnvironment(environmentId) {}
    getEnvironment(contractId) {}
    getEnvironment(smartContract) {}

    updateEnvironment(id, ncontractType, ncontractHashId, kvStorage, transactionPack) {
        return this.simpleUpdate("UPDATE environments  SET ncontract_type = ?,ncontract_hash_id = ?,kv_storage = ?,transaction_pack = ? WHERE id = ?",
            ncontractType,
            ncontractHashId.digest,
            kvStorage,
            transactionPack,
            id);
    }

    saveContractInStorage(contractId, binData, expiresAt, origin, environmentId) {
        return this.simpleUpdate("INSERT INTO contract_binary (hash_id, bin_data) VALUES (?,?) ON CONFLICT (hash_id) DO UPDATE SET bin_data=EXCLUDED.bin_data",
            contractId.digest,
            binData)
            .then(() => {
                return this.simpleQuery("INSERT INTO contract_storage (hash_id, origin, expires_at, environment_id) VALUES (?,?,?,?) RETURNING id",
                    x => {
                        if (x == null)
                            throw new LedgerException("saveContractInStorage failed: returning null");
                        else
                            return Number(x);
                    },
                    contractId.digest,
                    origin.digest,
                    Math.floor(expiresAt.getTime() / 1000),
                    environmentId);
            });
    }

    saveSubscriptionInStorage(hashId, subscriptionOnChain, expiresAt, environmentId) {
        return this.simpleQuery("INSERT INTO contract_subscription (hash_id, subscription_on_chain, expires_at, environment_id) VALUES(?,?,?,?) RETURNING id",
            x => {
                if (x == null)
                    throw new LedgerException("saveSubscriptionInStorage failed: returning null");
                else
                    return Number(x);
            },
            hashId.digest,
            subscriptionOnChain,
            Math.floor(expiresAt.getTime() / 1000),
            environmentId);
    }

    getSubscriptionEnviromentIds(id) {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let environmentIds = new Set();
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }
                            for (let i = 0; i < rows.length; i++) {
                                if (rows[i] != null)
                                    environmentIds.add(rows[i][0]);
                            }
                        }

                        con.release();
                        resolve(environmentIds);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT environment_id FROM contract_subscription WHERE hash_id = ? GROUP BY environment_id",
                    id.digest
                );
            });
        });
    }

    getFollowerCallbackStateById(id) { // TODO !!
        /*return this.simpleQuery("SELECT state FROM follower_callbacks WHERE id = ?",
            x => {
                if (x == null)
                    return NCallbackService.FollowerCallbackState.UNDEFINED;
                else
                    return NCallbackService.FollowerCallbackState.values()[x];
            },
            id.digest);*/
    }

    getFollowerCallbacksToResyncByEnvId(environmentId) {

    }
    getFollowerCallbacksToResync() {}

    addFollowerCallback(id, environmentId, expiresAt, storedUntil) {
        return this.simpleUpdate("INSERT INTO follower_callbacks (id, state, environment_id, expires_at, stored_until) VALUES (?,?,?,?,?)",
            id.digest,
            0, //NCallbackService.FollowerCallbackState.STARTED.ordinal() TODO !!
            environmentId,
            Math.floor(expiresAt.getTime() / 1000),
            Math.floor(storedUntil.getTime() / 1000));
    }

    updateFollowerCallbackState(id, state) {
        return this.simpleUpdate("UPDATE follower_callbacks SET state = ? WHERE id = ?",
            0, //state.ordinal() // TODO !!
            id.digest);
    }

    removeFollowerCallback(id) {
        return this.simpleUpdate("DELETE FROM follower_callbacks WHERE id = ?", id.digest);
    }

    clearExpiredStorages() {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE expires_at < ?", Math.floor(Date.now() / 1000));
    }

    clearExpiredSubscriptions() {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE expires_at < ?", Math.floor(Date.now() / 1000));
    }

    clearExpiredStorageContractBinaries() {
        //TODO: add trigger for delete expired contracts after deleting all subscriptions, and remove this function
        return this.simpleUpdate("DELETE FROM contract_binary WHERE hash_id NOT IN (SELECT hash_id FROM contract_storage GROUP BY hash_id)");
    }

    getSmartContractById(smartContractId) {
        return this.simpleQuery("SELECT transaction_pack FROM environments WHERE ncontract_hash_id=?",
            null,
            smartContractId.digest);
    }

    getContractInStorage(contractId) {
        return this.simpleQuery("SELECT bin_data FROM contract_binary WHERE hash_id=?",
            null,
            contractId.digest);
    }

    getContractInStorage(slotId, contractId) {
        return this.simpleQuery("SELECT bin_data FROM environments " +
            "LEFT JOIN contract_storage ON environments.id=contract_storage.environment_id " +
            "LEFT JOIN contract_binary ON contract_binary.hash_id=contract_storage.hash_id " +
            "WHERE environments.ncontract_hash_id=? AND contract_storage.hash_id=?",
            null,
            slotId.digest,
            contractId.digest);
    }

    getContractsInStorageByOrigin(slotId, originId) {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let res = [];
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }
                            for (let i = 0; i < rows.length; i++) {
                                if (rows[i] != null)
                                    res.push(rows[i][0]);
                            }
                        }

                        con.release();
                        resolve(res);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT bin_data FROM environments " +
                    "LEFT JOIN contract_storage ON environments.id=contract_storage.environment_id " +
                    "LEFT JOIN contract_binary ON contract_binary.hash_id=contract_storage.hash_id " +
                    "WHERE environments.ncontract_hash_id=? AND contract_storage.origin=?",
                    slotId.digest,
                    originId.digest
                );
            });
        });
    }

    removeEnvironmentSubscription(subscriptionId) {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE id = ?", subscriptionId);
    }

    removeEnvironmentStorage(storageId) {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE id = ?", storageId);
    }

    removeSubscriptionsByEnvId(environmentId) {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE environment_id = ?", environmentId);
    }

    removeStorageContractsByEnvId(environmentId) {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE environment_id = ?", environmentId);
    }

    removeEnvironment(ncontractHashId) {
        let envId = this.getEnvironmentId(ncontractHashId);
        this.removeSubscriptionsByEnvId(envId);
        this.removeStorageContractsByEnvId(envId);
        this.clearExpiredStorageContractBinaries();
        return this.removeEnvironmentEx(ncontractHashId);
    }

    removeExpiredStoragesAndSubscriptionsCascade() {
        this.clearExpiredSubscriptions();
        this.clearExpiredStorages();
        this.clearExpiredStorageContractBinaries();
    }

    addNameRecord(nameRecord) { // TODO !!
        /*let nameStorageId = this.addNameStorage(nameRecord);
        if (nameStorageId !== 0) {
            nameRecord.id = nameStorageId;
            this.removeNameRecordEntries(nameStorageId);
            for (NameRecordEntry nameRecordEntry : nameRecord.getEntries()) {
                ((NNameRecordEntry) nameRecordEntry).setNameRecordId(nameStorageId);
                addNameEntry((NNameRecordEntry) nameRecordEntry);
            }
        } else {
            throw new LedgerException("addNameRecord failed");
        }*/
    }

    removeNameRecord(nameReduced) {
        return this.simpleUpdate("DELETE FROM name_storage WHERE name_reduced=?", nameReduced);
    }

    removeNameRecordEntries(nameStorageId) {
        return this.simpleUpdate("DELETE FROM name_entry WHERE name_storage_id=?", nameStorageId);
    }

    getNameRecord(nameReduced) {}
    getNameByAddress(address) {}
    getNameByOrigin(origin) {}

    /**
     * Get unavailable names for UNS.
     *
     * @param {Array<string>} reducedNames - array of reduced names for check availability.
     * @return {Promise<Array<string>>} - array of unavailable names.
     */
    isAllNameRecordsAvailable(reducedNames) {
        if (reducedNames.length < 1)
            throw new ex.IllegalArgumentError("Error isAllNameRecordsAvailable: empty reducedNames");

        let query = "SELECT name_reduced FROM name_storage WHERE name_reduced IN (?";
        for (let i = 1; i < reducedNames.length; i++)
            query += ",?";

        query += ")";

        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let res = [];
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null)
                                    res.push(rows[i][0]);
                        }

                        con.release();
                        resolve(res);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    query,
                    ...reducedNames
                );
            });
        });
    }

    /**
     * Get unavailable origins for UNS.
     *
     * @param {Array<HashId>} origins - array of origins (@see HashId) for check availability.
     * @return {Promise<Array<string>>} - array of unavailable origins (as base64 strings).
     */
    isAllOriginsAvailable(origins) {
        if (origins.length < 1)
            throw new ex.IllegalArgumentError("Error isAllOriginsAvailable: empty origins");

        let query = "SELECT origin FROM name_entry WHERE origin IN (?";
        for (let i = 1; i < origins.length; i++)
            query += ",?";

        query += ")";

        let arr = [];
        for (let id of origins)
            arr.push(id.digest);

        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let res = [];
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null)
                                    res.push(crypto.HashId.withDigest(rows[i][0]).base64);
                        }

                        con.release();
                        resolve(res);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    query,
                    ...arr
                );
            });
        });
    }

    /**
     * Get unavailable addresses for UNS.
     *
     * @param {Array<string>} addresses - array of addresses for check availability.
     * @return {Promise<Array<string>>} - array of unavailable addresses (shorts and longs).
     */
    isAllAddressesAvailable(addresses) {
        if (addresses.length < 1)
            throw new ex.IllegalArgumentError("Error isAllNameRecordsAvailable: empty reducedNames");

        let queryPart = "?";
        for (let i = 1; i < addresses.length; i++)
            queryPart += ",?";

        let query = "SELECT short_addr, long_addr FROM name_entry WHERE short_addr IN (" +
            queryPart +") OR long_addr IN (" + queryPart + ")";



        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let res = [];
                        let count = qr.getRowsCount();
                        while (count > 0) {
                            let rows;
                            if (count > 1024) {
                                rows = qr.getRows(1024);
                                count -= 1024;
                            } else {
                                rows = qr.getRows(count);
                                count = 0;
                            }

                            for (let i = 0; i < rows.length; i++)
                                if (rows[i] != null) {
                                    res.push(rows[i][0]);
                                    res.push(rows[i][1]);
                                }
                        }

                        con.release();
                        resolve(res);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    query,
                    ...addresses,
                    ...addresses
                );
            });
        });
    }

    clearExpiredNameRecords(holdDuration) {
        return this.simpleUpdate("DELETE FROM name_storage WHERE expires_at < ? ", Math.floor(Date.now() / 1000) - holdDuration);
    }

    async cleanup(isPermanetMode) {
        let now = Math.floor(Date.now() / 1000);

        await this.simpleUpdate("delete from items where id in (select id from ledger where expires_at < ?);", now);
        await this.simpleUpdate("delete from items where keepTill < ?;", now);
        await this.simpleUpdate("delete from follower_callbacks where stored_until < ?;", now);
        if (!isPermanetMode)
            await this.simpleUpdate("delete from ledger where expires_at < ?;", now);
    }
}

module.exports = {Ledger};
