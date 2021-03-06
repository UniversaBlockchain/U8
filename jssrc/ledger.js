/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as db from 'pg_driver'
import * as trs from 'timers'
import {HashId} from 'crypto'

const StateRecord = require("staterecord").StateRecord;
const ItemState = require("itemstate").ItemState;
const t = require("tools");
const ex = require("exceptions");
const Boss = require("boss");
const Config = require("config").Config;

const NSmartContract = require("services/NSmartContract").NSmartContract;
const NContractSubscription = require("services/NContractSubscription").NContractSubscription;
const NContractStorage = require("services/NContractStorage").NContractStorage;
const NNameRecord = require("services/NNameRecord").NNameRecord;
const NNameRecordEntry = require("services/NNameRecordEntry").NNameRecordEntry;
const NFollowerService = require("services/NFollowerService").NFollowerService;
const NImmutableEnvironment = require("services/NImmutableEnvironment").NImmutableEnvironment;
const FollowerCallbackState = require("services/followerCallbackState").FollowerCallbackState;
const CallbackRecord = require("services/callbackRecord").CallbackRecord;
const Contract = require("contract").Contract;

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

        this.mapSave = new t.GenericMap();

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

    async init() {
        await db.MigrationDriver.createDB(this.dbPool_, "jssrc/migrations/postgres");
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

    simpleUpdate(sql, connection = undefined, ...params) {
        return new Promise((resolve, reject) => {
            let update = con => {
                con.executeUpdate(qr => {
                        if (connection == null)
                            con.release();
                        resolve();
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    sql,
                    ...params
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(update);
            else
                update(connection);
        });
    }

    simpleQuery(sql, processValue, connection = undefined, ...params) {
        return new Promise((resolve, reject) => {
            let query = con => {
                con.executeQuery(async (qr) => {
                        let row = qr.getRows(1)[0];
                        if (connection == null)
                            con.release();

                        let value = null;
                        if (row != null && row[0] != null)
                            value = row[0];

                        if (processValue != null)
                            resolve(await processValue(value));
                        else
                            resolve(value);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    sql,
                    ...params
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get the record by its ID.
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

    /*/**
     * Create a record in {@see ItemState#LOCKED_FOR_CREATION} state locked by creatorRecordId. Does not check
     * anything, the business logic of it is in the {@see StateRecord}. Still, if a database logic prevents creation of
     * a lock record (e.g. hash is already in use), it must return null.
     *
     * @param {number} creatorRecordId - Record that want to create new item.
     * @param {HashId} newItemHashId - New item hash.
     * @return {Promise<StateRecord|null>} ready saved instance or null if it can not be created (e.g. already exists).
     */
    /*createOutputLockRecord(creatorRecordId, newItemHashId) {

        //findOrCreate
        let r = new StateRecord(this);
        r.state = ItemState.LOCKED_FOR_CREATION;
        r.lockedByRecordId = creatorRecordId;

        if (r.id != null && !r.id.equals(newItemHashId))
            throw new ex.IllegalStateError("can't change id of StateRecord");

        r.id = newItemHashId;

        return r.save();
    }*/

    /**
     * Create new record for a given id and set it to the <b>newState</b> state. Normally, it is used to create new root
     * documents. If the record exists, it returns it. If the record does not exists, it creates new one with
     * <b>newState</b> state. The operation must be implemented as atomic.
     *
     * @param {HashId} itemId - HashId to register, or null if it is already in use.
     * @param {ItemState} newState - new item will be created with this state.
     *        Only PENDING and LOCKED_FOR_CREATION states are allowed
     * @param {Number} locked_by_id - use it with LOCKED_FOR_CREATION state
     * @return {Promise<StateRecord>} found or created {@link StateRecord}.
     */
    findOrCreate(itemId, newState = ItemState.PENDING, locked_by_id = 0) {
        return this.findOrCreate_buffered_insert(itemId, newState, locked_by_id).then((inserted_id) => {
            return this.findOrCreate_buffered_select(itemId, inserted_id);
        }).catch(reason => {
            console.error(reason);
        });
    }

    /**
     * Compatibility with transactions, but no buffered mode.
     */
    simpleFindOrCreate(itemId, newState = ItemState.PENDING, locked_by_id = 0, connection = null) {
        return new Promise(async (resolve0, reject0) => {
            let f = async con => {
                let promise1 = new Promise((resolve, reject) => {
                    con.executeUpdate(qr => {
                            resolve();
                        }, e => {
                            if (connection == null)
                                con.release();
                            reject(e);
                        },
                        "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES (?,?,?,?,?) ON CONFLICT (hash) DO NOTHING;",
                        itemId.digest,
                        newState.ordinal,
                        Math.floor(new Date().getTime() / 1000),
                        Math.floor(new Date().getTime() / 1000) + Config.maxElectionsTime + Math.floor(Math.random() * 10),
                        locked_by_id
                    );
                });
                await promise1;
                let promise2 = new Promise((resolve, reject) => {
                    con.executeQuery(qr => {
                            let row = qr.getRows(1)[0];
                            let record = StateRecord.initFrom(this, row);
                            if (connection == null)
                                con.release();
                            resolve(record);
                        }, e => {
                            if (connection == null)
                                con.release();
                            reject(e);
                        },
                        "SELECT * FROM ledger WHERE hash=? limit 1;",
                        itemId.digest
                    );
                });
                let res = await promise2;
                return res;
            };
            if (connection == null)
                this.dbPool_.withConnection(async con => resolve0(await f(con)));
            else
                resolve0(await f(connection));
        });
    }

    /**
     * Create new records for a given ids array and set it to the <b>newState</b> state. Normally, it is used to create
     * new root documents. If the record exists, it returns it. If the record does not exists, it creates new one with
     * <b>newState</b> state.
     *
     * @param {Array<HashId>} itemIds - array of HashId to register.
     * @param {ItemState} newState - new item will be created with this state.
     *        Only PENDING and LOCKED_FOR_CREATION states are allowed
     * @param {Number} locked_by_id - use it with LOCKED_FOR_CREATION state
     * @param {db.SqlDriverConnection} connection - Transaction connection for save record. Optional.
     * @return {Promise<Array<StateRecord>>} array of records.
     */
    arrayFindOrCreate(itemIds, newState = ItemState.PENDING, locked_by_id = 0, connection = null) {
        if (itemIds.length === 0)
            return [];

        return new Promise(async (resolve0, reject0) => {
            let queryInsert = "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES ";
            let querySelect = "SELECT * FROM ledger WHERE hash IN (";
            let paramsInsert = [];
            let paramsSelect = [];

            let first = true;
            for (let itemId of itemIds) {
                paramsInsert.push(itemId.digest);
                paramsInsert.push(newState.ordinal);
                paramsInsert.push(Math.floor(new Date().getTime() / 1000));
                paramsInsert.push(Math.floor(new Date().getTime() / 1000) + Config.maxElectionsTime + Math.floor(Math.random() * 10));
                paramsInsert.push(locked_by_id);

                paramsSelect.push(itemId.digest);

                if (!first) {
                    queryInsert += ",";
                    querySelect += ",";
                }
                queryInsert += "(?,?,?,?,?)";
                querySelect += "?";
                first = false;
            }

            queryInsert += " ON CONFLICT (hash) DO NOTHING;";
            querySelect += ") LIMIT " + paramsSelect.length + ";";

            let f = async con => {
                let promise1 = new Promise((resolve, reject) => {
                    con.executeUpdate(qr => {
                            resolve();
                        }, e => {
                            if (connection == null)
                                con.release();
                            reject(e);
                        },
                        queryInsert,
                        ...paramsInsert
                    );
                });
                await promise1;

                let promise2 = new Promise((resolve, reject) => {
                    con.executeQuery(qr => {
                            let rows = qr.getRows(0);
                            let records = [];

                            for (let j = 0; j < rows.length; j++)
                                records.push(StateRecord.initFrom(this, rows[j]));

                            //sort result records
                            if (records.length > 1)
                                for (let i = 0; i < records.length - 1; i++)
                                    if (!records[i].id.equals(itemIds[i]))
                                        for (let j = i + 1; j < records.length; j++)
                                            if (records[j].id.equals(itemIds[i])) {
                                                // swap records
                                                let swap = records[i];
                                                records[i] = records[j];
                                                records[j] = swap;

                                                break;
                                            }

                            if (connection == null)
                                con.release();
                            resolve(records);
                        }, e => {
                            if (connection == null)
                                con.release();
                            reject(e);
                        },
                        querySelect,
                        ...paramsSelect
                    );
                });

                return await promise2;
            };

            if (connection == null)
                this.dbPool_.withConnection(async con => resolve0(await f(con)));
            else
                resolve0(await f(connection));
        });
    }

    findOrCreate_buffered_insert(itemId, newState, locked_by_id) {
        if ((newState !== ItemState.PENDING) && (newState !== ItemState.LOCKED_FOR_CREATION))
            throw new ex.IllegalStateError("can't create new item with state " + newState.val);

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
                buf.set(itemId.base64, [itemId, [resolver], [rejecter], newState, locked_by_id, null]);
            }

            this.findOrCreate_buffered_insert_processBuf();
            return promise;
        } else {
            return new Promise((resolve, reject) => {
                this.dbPool_.withConnection(con => {
                    con.executeQuery(qr => {
                            con.release();
                            if (qr.getRowsCount() === 1)
                                resolve(qr.getRows(1)[0][0]);
                            else
                                resolve(null);
                        }, e => {
                            con.release();
                            reject(e);
                        },
                        "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES (?,?,?,?,?) ON CONFLICT (hash) DO NOTHING RETURNING id;",
                        itemId.digest,
                        newState.ordinal,
                        Math.floor(new Date().getTime()/1000),
                        Math.floor(new Date().getTime()/1000) + Config.maxElectionsTime + Math.floor(Math.random()*10),
                        locked_by_id
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
                        queryValues.push("(?,?,?,?,?)");
                        params.push(item[0].digest);
                        params.push(item[3].ordinal);
                        params.push(Math.floor(new Date().getTime()/1000));
                        params.push(Math.floor(new Date().getTime()/1000) + Config.maxElectionsTime + Math.floor(Math.random()*10));
                        params.push(item[4]);
                    }
                    let queryString = "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES "+queryValues.join(",")+" ON CONFLICT (hash) DO NOTHING RETURNING hash,id;";
                    con.executeQuery(qr => {
                        con.release();
                        let rows = qr.getRows(0);
                        for (let i = 0; i < rows.length; ++i) {
                            let hashId = crypto.HashId.withDigest(rows[i][0]);
                            if (map.has(hashId.base64))
                                map.get(hashId.base64)[5] = rows[i][1];
                        }
                        for (let [k,v] of map) {
                            this.bufParams.findOrCreate_insert.bufInProc.delete(k);
                            v[1].forEach(resolver => resolver(v[5])); // call resolvers
                        }
                    }, e => {
                        con.release();
                        for (let [k,v] of map) {
                            this.bufParams.findOrCreate_insert.bufInProc.delete(k);
                            v[2].forEach(rejecter => rejecter(e)); // call rejecters
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

    findOrCreate_buffered_select(itemId, inserted_id) {
        if (this.bufParams.findOrCreate_select.enabled) {
            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});
            if (this.bufParams.findOrCreate_select.buf.has(itemId.base64)) {
                let item = this.bufParams.findOrCreate_select.buf.get(itemId.base64);
                item[1].push(resolver);
                item[2].push(rejecter);
            } else {
                this.bufParams.findOrCreate_select.buf.set(itemId.base64, [itemId, [resolver], [rejecter], inserted_id]);
            }
            this.findOrCreate_buffered_select_processBuf();
            return promise;
        } else {
            return new Promise((resolve, reject) => {
                this.dbPool_.withConnection(con => {
                    con.executeQuery(qr => {
                            let row = qr.getRows(1)[0];
                            let record = StateRecord.initFrom(this, row);
                            if (record.recordId === inserted_id)
                                record.isJustCreated = true;
                            con.release();
                            resolve(record);
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
                            let bufItem = map.get(crypto.HashId.withDigest(rows[j][names["hash"]]).base64);
                            let resolversArr = bufItem[1];
                            for (let k = 0; k < resolversArr.length; ++k) {
                                let sr = StateRecord.initFrom(this, rows[j]);
                                if (sr.recordId === bufItem[3])
                                    sr.isJustCreated = true;
                                resolversArr[k](sr); // call resolver
                            }
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
     * @param {Function} block - Block to execute.
     * @return {Promise} null if transaction is rolled back throwing a exception, otherwise what callable.
     * returns.
     */
    transaction(block) {
        return this.dbPool_.transaction(block);
    }

    /**
     * Destroy the record and free space in the ledger.
     *
     * @param {StateRecord} record - StateRecord to destroy.
     * @param {db.SqlDriverConnection} connection - Transaction connection for destroy record. Optional.
     * @return {Promise} resolved when record destroyed.
     */
    destroy(record, connection = undefined) {
        if (record.recordId === 0)
            throw new ex.IllegalStateError("can't destroy record without recordId");

        this.cachedRecords.delete(record.id);
        this.cachedRecordsById.delete(record.recordId);

        return this.simpleUpdate("DELETE FROM items WHERE id = ?;", connection, record.recordId)
            .then(() => {
                return this.simpleUpdate("DELETE FROM ledger WHERE id = ?;", connection, record.recordId);
            });
    }

    /**
     * Destroy the record in the ledger in opened transaction.
     *
     * @param {StateRecord} record - StateRecord to destroy.
     * @param {db.SqlDriverConnection} connection - Transaction connection for destroy record.
     * @return {Promise} resolved when record destroyed.
     */
    /*transactionDestroy(record, connection) {
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
    }*/

    /**
     * Save a record into the ledger.
     *
     * @param {StateRecord} record - StateRecord to save.
     * @param {db.SqlDriverConnection} connection - Transaction connection for save record. Optional.
     * @param {boolean} buffering - Buffering mode in transaction. Optional.
     * @return {Promise<StateRecord> | StateRecord} resolved when record saved.
     */
    save(record, connection = undefined, buffering = false) {
        if (record.ledger == null) {
            record.ledger = this;
        } else if (record.ledger !== this)
            throw new ex.IllegalStateError("can't save with a different ledger (make a copy!)");

        if (record.recordId === 0)
            throw new ex.IllegalStateError("can't save record with id equals 0");

        this.putToCache(record);

        if (connection != null && buffering) {
            let buf = this.mapSave.get(connection);
            if (buf == null) {
                buf = [];
                this.mapSave.set(connection, buf);
            }

            buf.push(record.state.ordinal);
            buf.push(Math.floor(record.createdAt.getTime() / 1000));
            buf.push(Math.floor(record.expiresAt.getTime() / 1000));
            buf.push(record.lockedByRecordId);
            buf.push(record.recordId);

            return record;
        }

        return this.simpleUpdate("update ledger set state=?, created_at=?, expires_at=?, locked_by_id=? where id=?",
            connection,
            record.state.ordinal,
            Math.floor(record.createdAt.getTime() / 1000),
            Math.floor(record.expiresAt.getTime() / 1000),
            record.lockedByRecordId,
            record.recordId);
    }

    /**
     * Save a bufferized records (in transaction) into the ledger.
     *
     * @param {db.SqlDriverConnection} connection - Transaction connection for save record.
     * @return {Promise<undefined> | undefined}
     */
    arraySave(connection) {
        if (connection == null)
            return;

        let buf = this.mapSave.get(connection);
        if (buf == null || buf.length < 5)
            return;

        this.mapSave.delete(connection);

        return new Promise(async (resolve, reject) => {
            let query = "UPDATE ledger SET state = t.state, created_at = t.created_at, expires_at = t.expires_at, " +
                "locked_by_id = t.locked_by_id FROM (VALUES ";

            for (let j = 0; j < buf.length / 5; ++j) {
                if (j > 0)
                    query += ",";
                query += "(?::integer,?::integer,?::bigint,?::integer,?::integer)";
            }
            query += ") AS t(state, created_at, expires_at, locked_by_id, id) WHERE ledger.id = t.id";

            connection.executeUpdate(qr => {
                    resolve();
                }, e => {
                    reject(e);
                },
                query,
                ...buf
            );
        });
    }

    /**
     * Save a record into the ledger in opened transaction.
     *
     * @param {StateRecord} record - StateRecord to save.
     * @param {db.SqlDriverConnection} connection - Transaction connection for save record.
     * @return {Promise<StateRecord>} resolved when record saved.
     */
    /*transactionSave(record, connection) {
        if (record.recordId === 0)
            throw new ex.IllegalStateError("can't save record with id equals 0");

        return new Promise((resolve, reject) => {
            connection.executeUpdate(qr => {
                    this.putToCache(record);
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
    }*/

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
        await sleep(500+delay*1.5);
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
     * @param {Date} createdAfter - Creation time (in epoch seconds), those elements that are created after this time are taken into account.
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
     * @return {Promise<void>}
     */
    savePayment(amount, date) {
        return this.simpleUpdate("insert into payments_summary (amount,date) VALUES (?,?) ON CONFLICT (date) DO UPDATE SET amount = payments_summary.amount + excluded.amount",
            null,
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
     * @return {Promise<void>}
     */
    markTestRecord(itemId) {
        return this.simpleUpdate("insert into ledger_testrecords(hash) values(?) on conflict do nothing;",
            null, itemId.digest);
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
            null,
            itemId.digest);
    }

    /**
     * Update the expiration time of subscription to contract.
     *
     * @param {number} subscriptionId - Subscription ID.
     * @param {Date} expiresAt - Expiration time.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    updateSubscriptionInStorage(subscriptionId, expiresAt, con = undefined) {
        return this.simpleUpdate("UPDATE contract_subscription SET expires_at = ? WHERE id = ?", con,
            Math.floor(expiresAt.getTime() / 1000),
            subscriptionId);
    }

    /**
     * Update the expiration contract storage time.
     *
     * @param {number} storageId - Storage Id.
     * @param {Date} expiresAt - Expiration time.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    updateStorageExpiresAt(storageId, expiresAt, con = undefined) {
        return this.simpleUpdate("UPDATE contract_storage SET expires_at = ? WHERE id = ?", con,
            Math.floor(expiresAt.getTime() / 1000),
            storageId);
    }

    /**
     * Save the follower contract environment with the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {Date} expiresAt - The date of expiry of the period of storage environments.
     * @param {Date} mutedAt - The time before which the contract sends notifications.
     * @param {number} spent - Amount of U spent on sending the callbacks.
     * @param {number} startedCallbacks - Number of running callbacks.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    saveFollowerEnvironment(environmentId, expiresAt, mutedAt, spent, startedCallbacks, con = undefined) {
        return this.simpleUpdate("INSERT INTO follower_environments (environment_id, expires_at, muted_at, spent_for_callbacks, started_callbacks) " +
            "VALUES (?,?,?,?,?) ON CONFLICT (environment_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, " +
            "muted_at = EXCLUDED.muted_at, spent_for_callbacks = EXCLUDED.spent_for_callbacks, started_callbacks = EXCLUDED.started_callbacks",
            con,
            environmentId,
            Math.floor(expiresAt.getTime() / 1000),
            Math.floor(mutedAt.getTime() / 1000),
            spent,
            startedCallbacks);
    }

    /**
     * Update UNS name record.
     *
     * @param {number} nameRecordId - Name record id.
     * @param {Date} expiresAt - Storage expiration time name record.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    updateNameRecord(nameRecordId, expiresAt, con = undefined) {
        return this.simpleUpdate("UPDATE name_storage SET expires_at = ? WHERE id = ?", con,
            Math.floor(expiresAt.getTime() / 1000),
            nameRecordId);
    }

    saveEnvironmentToStorage(ncontractType, ncontractHashId, kvStorage, transactionPack, con = undefined) {
        return this.simpleQuery(
            "INSERT INTO environments (ncontract_type,ncontract_hash_id,kv_storage,transaction_pack) VALUES (?,?,?,?) " +
            "ON CONFLICT (ncontract_hash_id) DO UPDATE SET ncontract_type=EXCLUDED.ncontract_type, " +
            "kv_storage=EXCLUDED.kv_storage, transaction_pack=EXCLUDED.transaction_pack RETURNING id",
            x => {
                if (x == null)
                    throw new LedgerException("saveEnvironmentToStorage failed: returning null");
                else
                    return Number(x);
            },
            con,
            ncontractType,
            ncontractHashId.digest,
            kvStorage,
            transactionPack);
    }

    saveEnvironment_getConflicts(environment) {
        let ownSmartContractId = environment.contract.id;

        let namesToCheck = [];
        let originsToCheck = [];
        let addressesToCheck = [];
        environment.nameRecordsSet.forEach(nr => {
            namesToCheck.push(nr.nameReduced);
            nr.entries.forEach(entry => {
                if (entry.getOrigin() != null)
                    originsToCheck.push(entry.getOrigin());
                if (entry.getShortAddress() != null)
                    addressesToCheck.push(entry.getShortAddress());
                if (entry.getLongAddress() != null)
                    addressesToCheck.push(entry.getLongAddress());
            });
        });

        let queries = [];

        if (namesToCheck.length > 0) {
            let qpNames = "?";
            for (let i = 1; i < namesToCheck.length; i++)
                qpNames += ",?";

            queries.push("(SELECT environments.ncontract_hash_id " +
                "FROM name_storage JOIN environments ON name_storage.environment_id=environments.id " +
                "WHERE name_storage.name_reduced IN (" + qpNames + ") AND environments.ncontract_hash_id<>?)");
        }

        if (originsToCheck.length > 0) {
            let qpOrigins = "?";
            for (let i = 1; i < originsToCheck.length; i++)
                qpOrigins += ",?";

            queries.push("(SELECT environments.ncontract_hash_id " +
                "FROM name_entry JOIN name_storage ON name_entry.name_storage_id=name_storage.id " +
                "JOIN environments ON name_storage.environment_id=environments.id " +
                "WHERE name_entry.origin IN (" + qpOrigins + ") AND environments.ncontract_hash_id<>?)");
        }

        if (addressesToCheck.length > 0) {
            let qpAddresses = "?";
            for (let i = 1; i < addressesToCheck.length; i++)
                qpAddresses += ",?";

            queries.push("(SELECT environments.ncontract_hash_id " +
                "FROM name_entry JOIN name_storage ON name_entry.name_storage_id=name_storage.id " +
                "JOIN environments ON name_storage.environment_id=environments.id " +
                "WHERE (name_entry.short_addr IN (" + qpAddresses + ") OR name_entry.long_addr IN (" + qpAddresses +
                ")) AND environments.ncontract_hash_id<>?)");
        }

        if (queries.length === 0)
            return new t.GenericSet();

        let sqlQuery = queries.join(" UNION ");

        let params = [];
        namesToCheck.forEach(name => params.push(name));
        if (namesToCheck.length > 0)
            params.push(ownSmartContractId.digest);

        originsToCheck.forEach(origin => params.push(origin.digest));
        if (originsToCheck.length > 0)
            params.push(ownSmartContractId.digest);

        addressesToCheck.forEach(address => params.push(address));
        addressesToCheck.forEach(address => params.push(address));
        if (addressesToCheck.length > 0)
            params.push(ownSmartContractId.digest);

        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
                        let result = new t.GenericSet();
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
                                    result.add(crypto.HashId.withDigest(rows[i][0]));
                        }

                        con.release();
                        resolve(result);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    sqlQuery,
                    ...params
                );
            });
        });
    }

    /**
     * Save environment.
     *
     * @param {NImmutableEnvironment} environment.
     */
    async saveEnvironment(environment) {
        let conflicts = await this.saveEnvironment_getConflicts(environment);

        if (conflicts.size === 0) {
            let nsc = environment.contract;
            await this.removeEnvironment(nsc.id);
            let envId = await this.saveEnvironmentToStorage(nsc.getExtendedType(), nsc.id,
                await Boss.dump(environment.getMutable().kvStore), await nsc.getPackedTransaction());

            await Promise.all(Array.from(environment.nameRecords()).map(async(nr)=> {
                nr.environmentId = envId;
                await this.addNameRecord(nr);
            }));

            await Promise.all(Array.from(environment.subscriptions()).map(async(css) =>
                await this.saveSubscriptionInStorage(css.getHashId(), css.isChainSubscription(), css.expiresAt(), envId)));

            await Promise.all(Array.from(environment.storages()).map(async(cst) =>
                await this.saveContractInStorage((await cst.getContract()).id, cst.getPackedContract(), cst.expiresAt(), (await cst.getContract()).getOrigin(), envId)));

            let fs = environment.getFollowerService();
            if (fs != null)
                await this.saveFollowerEnvironment(envId, fs.expiresAt(), fs.mutedAt(), fs.getCallbacksSpent(), fs.getStartedCallbacks());
        }
        return conflicts;
    }

    /**
     * Find bad (not approved) items in ledger by set of IDs.
     *
     * @param {GenericSet<HashId>} ids - Set of HashId`s.
     * @return {Promise<GenericSet<HashId>>} set of IDs not approved items.
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

    /*/**
     * Save configuration to database.
     *
     * @param {NodeInfo} myInfo - Node information.
     * @param {NetConfig} netConfig - Network configuration.
     * @param {PrivateKey} nodeKey - Private key node.
     * @return {Promise<void>}
     */
    /*async saveConfig(myInfo, netConfig, nodeKey) {
        await this.simpleUpdate("delete from config;");

        for (let nodeInfo of netConfig.toList()) {
            let sqlText;
            let params = [nodeInfo.clientAddress.port,
                nodeInfo.serverAddress.port,
                nodeInfo.nodeAddress.port,
                nodeInfo.number,
                nodeInfo.name,
                nodeInfo.publicHost,
                nodeInfo.serverAddress.host,
                nodeInfo.publicKey.packed];

            if (nodeInfo.number === myInfo.number) {
                sqlText = "insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key,private_key) values(?,?,?,?,?,?,?,?,?);";
                params.push(nodeKey.packed);
            } else
                sqlText = "insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key) values(?,?,?,?,?,?,?,?);";

            await this.simpleUpdate(sqlText, null, ...params);
        }
    }*/

    /*/**
     * Load configuration from storage.
     *
     * @return {Promise<{myInfo: NodeInfo, netConfig: NetConfig, nodeKey: PrivateKey}>} which stores configuration information.
     */
    /*loadConfig() {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
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
                                    let nodeInfo = NodeInfo.withParameters(
                                        new crypto.PublicKey(rows[i][names["public_key"]]),
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
    }*/

    /*/**
     * Add information about node in configuration in database.
     *
     * @param {NodeInfo} nodeInfo - Node information.
     * @return {Promise<void>}
     */
    /*addNode(nodeInfo) {
        return this.simpleUpdate("insert into config(http_client_port,http_server_port,udp_server_port, node_number, node_name, public_host,host,public_key) values(?,?,?,?,?,?,?,?);",
            null,
            nodeInfo.clientAddress.port,
            nodeInfo.serverAddress.port,
            nodeInfo.nodeAddress.port,
            nodeInfo.number,
            nodeInfo.name,
            nodeInfo.publicHost,
            nodeInfo.serverAddress.host,
            nodeInfo.publicKey.packed);
    }*/

    /*/**
     * Remove node from config.
     *
     * @param {NodeInfo} nodeInfo - Node information.
     * @return {Promise<void>}
     */
    /*removeNode(nodeInfo) {
        return this.simpleUpdate("delete from config where node_number = ?;", null,
            nodeInfo.number);
    }*/

    /**
     * Search for unfinished items in Ledger.
     *
     * @return {Promise<GenericMap<HashId, StateRecord>>} from incomplete records.
     */
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

    /**
     * Get a contract from Ledger by his record.
     *
     * @param {StateRecord} record - Record of the contract you want to get.
     * @return {Promise<Uint8Array>} packed transaction with contract.
     */
    getItem(record) {
        return this.simpleQuery("select packed from items where id = ?",
            async (x) => (x != null) ? await Contract.fromPackedTransaction(x) : null,
            null,
            record.recordId);
    }

    /**
     * Put a contract from Ledger.
     *
     * @param {StateRecord} record - Record in storage.
     * @param {Contract} item - Contract.
     * @param {Date} keepTill - Time keep till.
     * @return {Promise<void> | void}
     */
    async putItem(record, item, keepTill) {
        if (!item instanceof Contract)
            return;

        return this.simpleUpdate("insert into items(id,packed,keepTill) values(?,?,?);", null,
            record.recordId,
            await item.getPackedTransaction(),
            Math.floor(keepTill.getTime() / 1000));
    }

    /**
     * Get stored item on his contract ID.
     *
     * @param {HashId} itemId - Contract ID.
     * @return {Promise<Uint8Array>} packed Contract
     */
    getKeptItem(itemId) {
        return this.simpleQuery("select * from kept_items, ledger where ledger.hash = ? and ledger.id = kept_items.ledger_id limit 1",
            null,
            itemId.digest);
    }

    getKeptBy(field, id, tags, limit, offset, sortBy, sortOrder) {
        return null;
    }

    /**
     * Put item in storage.
     *
     * @param {StateRecord} record - State record.
     * @param {Contract} item - Contract.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void> | void}
     */
    async putKeptItem(record, item, con = undefined) {
        if (!item instanceof Contract)
            return;

        return this.simpleUpdate("insert into kept_items (ledger_id,origin,parent,packed) values(?,?,?,?);",
            con,
            record.recordId,
            item.getOrigin().digest,
            item.parent != null ? item.parent.digest : null,
            await item.getPackedTransaction()
        );
    }

    /**
     * Get data of smart contract with the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<{pack: Uint8Array, kvStorage: Uint8Array, hashDigest: Uint8Array}>} smart contract data.
     */
    getSmartContractForEnvironmentId(environmentId, connection = undefined) {
        return new Promise((resolve, reject) => {
            let query = con => {
                con.executeQuery(qr => {
                        let row = qr.getRows(1)[0];
                        if (connection == null)
                            con.release();

                        if (row == null)
                            resolve(null);
                        else
                            resolve({
                                pack: row[0],
                                kvStorage: row[1],
                                hashDigest: row[2]
                            });
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT transaction_pack, kv_storage, ncontract_hash_id FROM environments WHERE id=?",
                    environmentId
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get contract subscriptions with the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<Array<NContractSubscription>>} list of contract subscriptions.
     */
    getContractSubscriptions(environmentId, connection = undefined) {
        return new Promise(async(resolve, reject) => {
            let query = con => {
                con.executeQuery(qr => {
                        let result = [];
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
                                    let css = new NContractSubscription(crypto.HashId.withDigest(rows[i][0]),
                                        Boolean(rows[i][1]), new Date(rows[i][2] * 1000));
                                    css.id = rows[i][3];
                                    result.push(css);
                                }
                        }

                        if (connection == null)
                            con.release();
                        resolve(result);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT hash_id, subscription_on_chain, expires_at, id FROM contract_subscription WHERE environment_id = ?",
                    environmentId
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get contract storages with the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<Array<NContractStorage>>} list of contract storages.
     */
    getContractStorages(environmentId, connection = undefined) {
        return new Promise(async(resolve, reject) => {
            let query = con => {
                con.executeQuery(qr => {
                        let result = [];
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
                                    let cst = new NContractStorage(rows[i][0], new Date(rows[i][1] * 1000));
                                    cst.id = rows[i][2];
                                    result.push(cst);
                                }
                        }

                        if (connection == null)
                            con.release();
                        resolve(result);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT bin_data, expires_at, id FROM contract_storage JOIN contract_binary " +
                    "ON contract_binary.hash_id = contract_storage.hash_id WHERE environment_id = ?",
                    environmentId
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get UNS reduced names by the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<Array<string>>} list of UNS reduced names.
     */
    getReducedNames(environmentId, connection = undefined) {
        return new Promise(async(resolve, reject) => {
            let query = con => {
                con.executeQuery(qr => {
                        let result = [];
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
                                    result.push(rows[i][0]);
                        }

                        if (connection == null)
                            con.release();
                        resolve(result);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT DISTINCT name_storage.name_reduced AS name_reduced " +
                    "FROM name_storage JOIN name_entry ON name_storage.id=name_entry.name_storage_id " +
                    "WHERE name_storage.environment_id=?",
                    environmentId
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get follower service by the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<NFollowerservice>} follower service.
     */
    getFollowerService(environmentId, connection = undefined) {
        return new Promise((resolve, reject) => {
            let query = con => {
                con.executeQuery(qr => {
                        let row = qr.getRows(1)[0];
                        if (connection == null)
                            con.release();

                        if (row == null)
                            resolve(null);
                        else
                            resolve(new NFollowerService(this,
                                environmentId,
                                new Date(row[0] * 1000),
                                new Date(row[1] * 1000),
                                row[2],
                                row[3]));
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT expires_at, muted_at, spent_for_callbacks, started_callbacks FROM follower_environments WHERE environment_id = ?",
                    environmentId
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get environment ID by specified smart contract ID.
     *
     * @param {HashId} smartContractId - Smart contract ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<number>} environment ID.
     */
    getEnvironmentIdForSmartContractId(smartContractId, con = undefined) {
        return this.simpleQuery("SELECT id FROM environments WHERE ncontract_hash_id=?",
            x => (x != null) ? Number(x) : null,
            con,
            smartContractId.digest);
    }

    /**
     * Get contract environment with the specified environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<NImmutableEnvironment>} environment.
     */
    async getEnvironment(environmentId, con = undefined) {
        let smkv = await this.getSmartContractForEnvironmentId(environmentId, con);
        let nContractHashId = crypto.HashId.withDigest(smkv.hashDigest);
        let contract = await NSmartContract.fromPackedTransaction(smkv.pack);
        let findNContract = (contract.transactionPack != null) ? contract.transactionPack.subItems.get(nContractHashId) : null;
        contract = (findNContract == null) ? contract : findNContract;
        let kvStorage = await Boss.load(smkv.kvStorage);

        let contractSubscriptions = await this.getContractSubscriptions(environmentId, con);
        let contractStorages = await this.getContractStorages(environmentId, con);
        let followerService = await this.getFollowerService(environmentId, con);
        let reducedNames = await this.getReducedNames(environmentId, con);

        let nameRecords = [];
        await Promise.all(reducedNames.map(async(name) => nameRecords.push(await this.getNameRecord(name, con))));

        let nImmutableEnvironment = new NImmutableEnvironment(contract, this, kvStorage, contractSubscriptions,
            contractStorages, nameRecords, followerService);
        nImmutableEnvironment.id = environmentId;

        return nImmutableEnvironment;
    }

    /**
     * Get contract environment by specified smart contract ID.
     *
     * @param {HashId} smartContractId - Smart contract ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<NImmutableEnvironment> | null} environment or null if error.
     */
    async getEnvironmentByContractID(smartContractId, con = undefined) {
        let envId = await this.getEnvironmentIdForSmartContractId(smartContractId, con);
        if (envId != null)
            return await this.getEnvironment(envId, con);
        return null;
    }

    /**
     * Get contract environment by specified smart contract.
     * If environment not found (also by parent contract), save new environment.
     *
     * @param {NSmartContract} smartContract - Smart contract.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<NImmutableEnvironment>} environment.
     */
    async getEnvironmentByContract(smartContract, con = undefined) {
        let nim = await this.getEnvironmentByContractID(smartContract.id, con);

        if (nim == null && smartContract.state.parent != null)
            nim = await this.getEnvironmentByContractID(smartContract.state.parent, con);

        if (nim == null) {
            let envId = await this.saveEnvironmentToStorage(smartContract.getExtendedType(), smartContract.id,
                await Boss.dump({}), await smartContract.getPackedTransaction(), con);
            nim = await this.getEnvironment(envId, con);
        } else
            nim.contract = smartContract;

        return nim;
    }

    /**
     * Updates the contract environment with the specified environment ID.
     *
     * @param {number} id - Environment ID.
     * @param {string} ncontractType - Ncontract type.
     * @param {HashId} ncontractHashId - Ncontract HashId.
     * @param {Uint8Array} kvStorage - Key-value storage.
     * @param {Uint8Array} transactionPack - Contract transaction pack.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    updateEnvironment(id, ncontractType, ncontractHashId, kvStorage, transactionPack, con = undefined) {
        return this.simpleUpdate("UPDATE environments  SET ncontract_type = ?,ncontract_hash_id = ?,kv_storage = ?,transaction_pack = ? WHERE id = ?",
            con,
            ncontractType,
            ncontractHashId.digest,
            kvStorage,
            transactionPack,
            id);
    }

    /**
     * Save the contract with the specified ID in the storage.
     *
     * @param {HashId} contractId - Contract ID.
     * @param {Uint8Array} binData
     * @param {Date} expiresAt - Expiration time.
     * @param {HashId} origin - Contracts chain origin.
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise}
     */
    saveContractInStorage(contractId, binData, expiresAt, origin, environmentId, con = undefined) {
        return this.simpleUpdate("INSERT INTO contract_binary (hash_id, bin_data) VALUES (?,?) ON CONFLICT (hash_id) DO UPDATE SET bin_data=EXCLUDED.bin_data",
            con,
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
                    con,
                    contractId.digest,
                    origin.digest,
                    Math.floor(expiresAt.getTime() / 1000),
                    environmentId);
            });
    }

    /**
     * Save the subscription in the storage.
     *
     * @param {HashId} hashId - subscription HashId (contract ID or origin).
     * @param {boolean} subscriptionOnChain - true if subscribe by contract ID, false if subscribe by origin.
     * @param {Date} expiresAt - Expiration time.
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise}
     */
    saveSubscriptionInStorage(hashId, subscriptionOnChain, expiresAt, environmentId, con = undefined) {
        return this.simpleQuery("INSERT INTO contract_subscription (hash_id, subscription_on_chain, expires_at, environment_id) VALUES(?,?,?,?) RETURNING id",
            x => {
                if (x == null)
                    throw new LedgerException("saveSubscriptionInStorage failed: returning null");
                else
                    return Number(x);
            },
            con,
            hashId.digest,
            subscriptionOnChain,
            Math.floor(expiresAt.getTime() / 1000),
            environmentId);
    }

    /**
     * Get item IDs that have subscriptions.
     *
     * @param {Array<HashId>} itemIds - array of HashId to check for having subscriptions.
     * @param {db.SqlDriverConnection} connection - Transaction connection for save record. Optional.
     * @return {Promise<GenericSet<HashId>> | GenericSet<HashId>} set of HashId that have subscriptions.
     */
    getItemsWithSubscriptions(itemIds, connection = null) {
        if (itemIds.length === 0)
            return new t.GenericSet();

        return new Promise(async (resolve, reject) => {
            let query = "SELECT count(environment_id) AS cnt FROM contract_subscription WHERE hash_id IN (";
            let params = [];

            let first = true;
            for (let itemId of itemIds) {
                params.push(itemId.digest);

                if (!first)
                    query += ",";

                query += "?";
                first = false;
            }

            query += ") GROUP BY environment_id, hash_id;";

            let f = con => {
                con.executeQuery(qr => {
                        let rows = qr.getRows(0);
                        let names = qr.getColNamesMap();
                        let items = new t.GenericSet();

                        for (let j = 0; j < rows.length; j++)
                            if (rows[j][names["cnt"]] > 0)
                                items.add(crypto.HashId.withDigest(rows[j][names["hash_id"]]));

                        if (connection == null)
                            con.release();
                        resolve(items);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    query,
                    ...params
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(f);
            else
                f(connection);
        });
    }

    /**
     * Get a set of IDs of all environments that are subscribed to a contract with the specified ID.
     *
     * @param {HashId} id - Subscription HashId (contract ID or origin).
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @return {Promise<Set<number>>} - set of environments IDs.
     */
    getSubscriptionEnviromentIds(id, connection = undefined) {
        return new Promise(async(resolve, reject) => {
            let query = con => {
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

                        if (connection == null)
                            con.release();
                        resolve(environmentIds);
                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    "SELECT environment_id FROM contract_subscription WHERE hash_id = ? GROUP BY environment_id",
                    id.digest
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(query);
            else
                query(connection);
        });
    }

    /**
     * Get state of follower callback with the specified ID.
     *
     * @param {HashId} id - follower callback ID.
     * @return {Promise<FollowerCallbackState>} - set of environments IDs.
     */
    getFollowerCallbackStateById(id) {
        return this.simpleQuery("SELECT state FROM follower_callbacks WHERE id = ?",
            x => {
                if (x == null)
                    return FollowerCallbackState.UNDEFINED;
                else
                    return FollowerCallbackState.byOrdinal.get(x);
            },
            null,
            id.digest);
    }

    /**
     * Get follower callbacks for resync from specified environment.
     *
     * @param {number} environmentId - environment ID.
     * @return {Promise<Array<CallbackRecord>>} - array of {@link CallbackRecord} for resync.
     */
    getFollowerCallbacksToResyncByEnvId(environmentId) {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let records = [];
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
                                    records.push(new CallbackRecord(
                                        crypto.HashId.withDigest(rows[i][0]),
                                        environmentId,
                                        FollowerCallbackState.byOrdinal.get(rows[i][1])));
                            }
                        }

                        con.release();
                        resolve(records);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT id, state FROM follower_callbacks WHERE environment_id = ? AND expires_at < ? AND (state = ? OR state = ?)",
                    environmentId,
                    Math.floor(Date.now() / 1000),
                    FollowerCallbackState.STARTED.ordinal,
                    FollowerCallbackState.EXPIRED.ordinal
                );
            });
        });
    }

    /**
     * Get follower callbacks for resync from all environments.
     *
     * @return {Promise<Array<CallbackRecord>>} - array of {@link CallbackRecord} for resync.
     */
    getFollowerCallbacksToResync() {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(async(qr) => {
                        let records = [];
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
                                    records.push(new CallbackRecord(
                                        crypto.HashId.withDigest(rows[i][0]),
                                        rows[i][2],
                                        FollowerCallbackState.byOrdinal.get(rows[i][1])));
                            }
                        }

                        con.release();
                        resolve(records);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT id, state, environment_id FROM follower_callbacks WHERE expires_at < ? AND (state = ? OR state = ?)",
                    Math.floor(Date.now() / 1000),
                    FollowerCallbackState.STARTED.ordinal,
                    FollowerCallbackState.EXPIRED.ordinal
                );
            });
        });
    }

    /**
     * Add to the repository an entry about the callback follower contract.
     *
     * @param {HashId} id - Callback ID.
     * @param {number} environmentId - Environment ID.
     * @param {Date} expiresAt - Expiration time.
     * @param {Date} storedUntil - Time stored until.
     * @return {Promise<void>}
     */
    addFollowerCallback(id, environmentId, expiresAt, storedUntil) {
        return this.simpleUpdate("INSERT INTO follower_callbacks (id, state, environment_id, expires_at, stored_until) VALUES (?,?,?,?,?)",
            null,
            id.digest,
            FollowerCallbackState.STARTED.ordinal,
            environmentId,
            Math.floor(expiresAt.getTime() / 1000),
            Math.floor(storedUntil.getTime() / 1000));
    }

    /**
     * Update in the storage the callback record of the follower contract.
     *
     * @param {HashId} id - Callback ID.
     * @param {FollowerCallbackState} state - Callback state.
     * @return {Promise<void>}
     */
    updateFollowerCallbackState(id, state) {
        return this.simpleUpdate("UPDATE follower_callbacks SET state = ? WHERE id = ?", null,
            state.ordinal,
            id.digest);
    }

    /**
     * Remove the callback entry from the storage.
     *
     * @param {HashId} id - Callback ID.
     * @return {Promise<void>}
     */
    removeFollowerCallback(id) {
        return this.simpleUpdate("DELETE FROM follower_callbacks WHERE id = ?", null, id.digest);
    }

    /**
     * Remove expired contract storage subscriptions.
     *
     * @return {Promise<void>}
     */
    clearExpiredStorages() {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE expires_at < ?", null,
            Math.floor(Date.now() / 1000));
    }

    /**
     * Remove expired Subscriptions.
     *
     * @return {Promise<void>}
     */
    clearExpiredSubscriptions() {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE expires_at < ?", null,
            Math.floor(Date.now() / 1000));
    }

    /**
     * Remove expired stored contracts.
     *
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    clearExpiredStorageContractBinaries(con = undefined) {
        //TODO: add trigger for delete expired contracts after deleting all subscriptions, and remove this function
        return this.simpleUpdate("DELETE FROM contract_binary WHERE hash_id NOT IN (SELECT hash_id FROM contract_storage GROUP BY hash_id)", con);
    }

    /**
     * Get smart contract by ID.
     *
     * @param {crypto.HashId} smartContractId - Contract ID.
     * @return {Promise<Uint8Array>} - packed transaction with smart contract.
     */
    getSmartContractById(smartContractId) {
        return this.simpleQuery("SELECT transaction_pack FROM environments WHERE ncontract_hash_id=?",
            null,
            null,
            smartContractId.digest);
    }

    /**
     * Get a contract from storage.
     *
     * @param {crypto.HashId} contractId - Contract ID.
     * @return {Promise<Uint8Array>} packed transaction with contract.
     */
    getContractInStorage(contractId) {
        return this.simpleQuery("SELECT bin_data FROM contract_binary WHERE hash_id=?",
            null,
            null,
            contractId.digest);
    }

    /**
     * Get a list of packed contracts from the repository by origin.
     *
     * @param {crypto.HashId} slotId - Slot contract ID.
     * @param {crypto.HashId} originId - Contracts chain origin.
     * @return {Promise<Array<Uint8Array>>} - list of packed contracts.
     */
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

    /**
     * Remove subscription by ID.
     *
     * @param subscriptionId - Subscription ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeEnvironmentSubscription(subscriptionId, con = undefined) {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE id = ?", con, subscriptionId);
    }

    /**
     * Remove storage subscription by ID.
     *
     * @param {number} storageId - Storage ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeEnvironmentStorage(storageId, con = undefined) {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE id = ?", con, storageId);
    }

    /**
     * Remove subscription by environment ID.
     *
     * @param {number} environmentId - Environment ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeSubscriptionsByEnvId(environmentId, con = undefined) {
        return this.simpleUpdate("DELETE FROM contract_subscription WHERE environment_id = ?", con, environmentId);
    }

    /**
     * Remove storage contract by environment ID.
     *
     * @param environmentId - Environment ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeStorageContractsByEnvId(environmentId, con = undefined) {
        return this.simpleUpdate("DELETE FROM contract_storage WHERE environment_id = ?", con, environmentId);
    }

    /**
     * Get environment ID by smart contract ID.
     *
     * @param {HashId} ncontractHashId - smart contract ID.
     * @return {Promise<number>} environment ID.
     */
    getEnvironmentId(ncontractHashId) {
        return this.simpleQuery("SELECT id FROM environments WHERE ncontract_hash_id=?",
            x => {
                if (x == null)
                    return 0;
                else
                    return Number(x);
            },
            null,
            ncontractHashId.digest);
    }

    /**
     * Remove environment by smart contract ID.
     *
     * @param {HashId} ncontractHashId - smart contract ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    async removeEnvironment(ncontractHashId, con = undefined) {
        let envId = await this.getEnvironmentId(ncontractHashId);
        if (envId === 0)
            return;

        await this.removeSubscriptionsByEnvId(envId, con);
        await this.removeStorageContractsByEnvId(envId, con);
        await this.clearExpiredStorageContractBinaries(con);
        await this.simpleUpdate("DELETE FROM environments WHERE ncontract_hash_id=?", con, ncontractHashId.digest);
    }

    /**
     * Delete expired subscriptions and stored contracts.
     *
     */
    async removeExpiredStoragesAndSubscriptionsCascade() {
        await this.clearExpiredSubscriptions();
        await this.clearExpiredStorages();
        await this.clearExpiredStorageContractBinaries();
    }

    /**
     * Save UNS name.
     *
     * @param {NNameRecord} nameRecord - UNS name.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<number>} created name record ID.
     */
    addNameStorage(nameRecord, con = undefined) {
        return this.simpleQuery(
            "INSERT INTO name_storage (name_reduced,name_full,description,url,expires_at,environment_id) " +
            "VALUES (?,?,?,?,?,?) ON CONFLICT (name_reduced) DO UPDATE SET name_full=EXCLUDED.name_full, " +
            "description=EXCLUDED.description, url=EXCLUDED.url, expires_at=EXCLUDED.expires_at, " +
            "environment_id=EXCLUDED.environment_id RETURNING id",
            x => {
                if (x == null)
                    throw new LedgerException("addNameStorage failed: returning null");
                else
                    return Number(x);
            },
            con,
            nameRecord.nameReduced,
            nameRecord.name,
            nameRecord.description,
            nameRecord.url,
            Math.floor(nameRecord.expiresAt.getTime() / 1000),
            nameRecord.environmentId);
    }

    /**
     * Save UNS name record entry.
     *
     * @param {NNameRecordEntry} nameRecordEntry - UNS name record entry.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<number>} created name record entry ID.
     */
    addNameEntry(nameRecordEntry, con = undefined) {
        return this.simpleQuery(
            "INSERT INTO name_entry (name_storage_id,short_addr,long_addr,origin) VALUES (?,?,?,?) RETURNING entry_id",
            x => {
                if (x == null)
                    throw new LedgerException("addNameEntry failed: returning null");
                else
                    return Number(x);
            },
            con,
            nameRecordEntry.nameRecordId,
            nameRecordEntry.shortAddress,
            nameRecordEntry.longAddress,
            (nameRecordEntry.origin == null) ? null : nameRecordEntry.origin.digest);
    }

    /**
     * Save UNS name record.
     *
     * @param {NNameRecord} nameRecord - UNS name record.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    async addNameRecord(nameRecord, con = undefined) {
        let nameStorageId = await this.addNameStorage(nameRecord, con);
        if (nameStorageId !== 0) {
            nameRecord.id = nameStorageId;
            await this.removeNameRecordEntries(nameStorageId, con);

            await Promise.all(nameRecord.entries.map(async(entry) => {
                entry.nameRecordId = nameStorageId;
                await this.addNameEntry(entry, con);
            }));
        } else
            throw new LedgerException("addNameRecord failed");
    }

    /**
     * Remove UNS name record.
     *
     * @param {string} nameReduced - Reduced name of UNS name record.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeNameRecord(nameReduced, con = undefined) {
        return this.simpleUpdate("DELETE FROM name_storage WHERE name_reduced=?", con, nameReduced);
    }

    /**
     * Remove UNS name record entries.
     *
     * @param {number} nameStorageId - UNS name record ID.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<void>}
     */
    removeNameRecordEntries(nameStorageId, con = undefined) {
        return this.simpleUpdate("DELETE FROM name_entry WHERE name_storage_id=?", con, nameStorageId);
    }

    /**
     * Get UNS name record with specified SQL clause WHERE.
     *
     * @param {string} clause - SQL clause WHERE.
     * @param {db.SqlDriverConnection} connection - Transaction connection. Optional.
     * @param params - query parameters.
     *
     * @return {Promise<NNameRecord>} UNS name record.
     */
    getNameBy(clause, connection = undefined, ...params) {
        let query = "SELECT " +
            "  name_storage.id AS id, " +
            "  name_storage.name_reduced AS name_reduced, " +
            "  name_storage.name_full AS name_full, " +
            "  name_storage.description AS description, " +
            "  name_storage.url AS url, " +
            "  name_storage.expires_at AS expires_at, " +
            "  name_storage.environment_id AS environment_id, " +
            "  name_entry.entry_id AS entry_id, " +
            "  name_entry.short_addr AS short_addr, " +
            "  name_entry.long_addr AS long_addr, " +
            "  name_entry.origin AS origin " +
            "FROM name_storage JOIN name_entry ON name_storage.id=name_entry.name_storage_id " +
            clause;

        return new Promise(async(resolve, reject) => {
            let qblock = con => {
                con.executeQuery(qr => {
                        let unsName = new UnsName();
                        let nameRecord_id = 0;
                        let nameRecord_expiresAt = new Date();
                        let nameRecord_environmentId = 0;
                        let entries = new t.GenericSet();
                        let firstRow = true;
                        let rowsCount = 0;

                        let count = qr.getRowsCount();
                        let names = qr.getColNamesMap();

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
                                    rowsCount++;

                                    if (firstRow) {
                                        nameRecord_id = rows[i][names["id"]];
                                        unsName.unsReducedName = rows[i][names["name_reduced"]];
                                        unsName.unsName = rows[i][names["name_full"]];
                                        unsName.unsDescription = rows[i][names["description"]];
                                        unsName.unsURL = rows[i][names["url"]];
                                        nameRecord_expiresAt = new Date(rows[i][names["expires_at"]] * 1000);
                                        nameRecord_environmentId = rows[i][names["environment_id"]];
                                        firstRow = false;
                                    }

                                    let nameRecordEntry = new NNameRecordEntry(
                                        crypto.HashId.withDigest(rows[i][names["origin"]]),
                                        rows[i][names["short_addr"]],
                                        rows[i][names["long_addr"]]);

                                    nameRecordEntry.id = rows[i][names["entry_id"]];
                                    nameRecordEntry.nameRecordId = nameRecord_id;

                                    entries.add(nameRecordEntry);
                                }
                        }

                        if (connection == null)
                            con.release();
                        if (count > 0)
                            resolve(new NNameRecord(unsName, nameRecord_expiresAt, entries, nameRecord_id, nameRecord_environmentId));
                        else
                            resolve(null);

                    }, e => {
                        if (connection == null)
                            con.release();
                        reject(e);
                    },
                    query,
                    ...params
                );
            };

            if (connection == null)
                this.dbPool_.withConnection(qblock);
            else
                qblock(connection);
        });
    }

    /**
     * Get UNS name record by reduced name.
     *
     * @param {string} nameReduced - reduced name.
     * @param {db.SqlDriverConnection} con - Transaction connection. Optional.
     * @return {Promise<NNameRecord>} UNS name record.
     */
    getNameRecord(nameReduced, con = undefined) {
        return this.getNameBy("WHERE name_storage.name_reduced=?", con, nameReduced);
    }

    /**
     * Get UNS name record by address.
     *
     * @param {string} address - name record address.
     *
     * @return {Promise<NNameRecord>} UNS name record.
     */
    getNameByAddress(address) {
        return this.getNameBy(
            "WHERE name_storage.id=(SELECT name_storage_id FROM name_entry WHERE short_addr=? OR long_addr=? LIMIT 1)",
            address, address);
    }

    /**
     * Get UNS name record by origin.
     *
     * @param {Uint8Array} origin - digest of name record origin.
     *
     * @return {Promise<NNameRecord>} UNS name record.
     */
    getNameByOrigin(origin) {
        return this.getNameBy("WHERE name_storage.id=(SELECT name_storage_id FROM name_entry WHERE origin=?)", origin);
    }

    /**
     * Get unavailable names for UNS.
     *
     * @param {Array<string>} reducedNames - Array of reduced names for check availability.
     * @return {Promise<Array<string>>} array of unavailable names.
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
     * @param {Array<HashId>} origins - Array of origins (@see HashId) for check availability.
     * @return {Promise<Array<string>>} array of unavailable origins (as base64 strings).
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
     * @param {Array<string>} addresses - Array of addresses for check availability.
     * @return {Promise<Array<string>>} array of unavailable addresses (shorts and longs).
     */
    isAllAddressesAvailable(addresses) {
        if (addresses.length < 1)
            throw new ex.IllegalArgumentError("Error isAllAddressesAvailable: empty addresses");

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

    /**
     *
     * Delete the names of records that have expired earlier than the holdDuration seconds to date.
     *
     * @param {Date} holdDuration - Number of seconds.
     * @return {Promise<void>}
     */
    clearExpiredNameRecords(holdDuration) {
        return this.simpleUpdate("DELETE FROM name_storage WHERE expires_at < ? ", null,
            Math.floor(Date.now() / 1000) - holdDuration);
    }

    /**
     * Clearing all expired database entries.
     *
     * @param isPermanetMode - Permanet mode.
     * @return {Promise<void>}
     */
    async cleanup(isPermanetMode) {
        let now = Math.floor(Date.now() / 1000);

        await this.simpleUpdate("delete from items where id in (select id from ledger where expires_at < ?);", null, now);
        await this.simpleUpdate("delete from items where keepTill < ?;", null, now);
        await this.simpleUpdate("delete from follower_callbacks where stored_until < ?;", null, now);
        if (!isPermanetMode)
            await this.simpleUpdate("delete from ledger where expires_at < ?;", null, now);
    }
}

module.exports = {Ledger};
