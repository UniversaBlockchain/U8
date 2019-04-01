import * as db from 'pg_driver'
import * as trs from 'timers'

const StateRecord = require("staterecord").StateRecord;

class LedgerException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class Ledger {

    constructor(connectionString) {
        this.MAX_CONNECTIONS = 64;

        this.bufParams = {
            findOrCreate: {enabled: true},
            findOrCreate_insert: {enabled: true, bufSize: 200, delayMillis: 40, buf: [], ts: new Date().getTime()},
            findOrCreate_select: {enabled: true, bufSize: 400, delayMillis: 40, buf: [], ts: new Date().getTime()},
        };

        this.timers_ = [];
        if (this.bufParams.findOrCreate.enabled && this.bufParams.findOrCreate_insert.enabled)
            this.addTimer(this.bufParams.findOrCreate_insert.delayMillis, this.findOrCreate_buffered_insert_processBuf.bind(this));
        if (this.bufParams.findOrCreate.enabled && this.bufParams.findOrCreate_select.enabled)
            this.addTimer(this.bufParams.findOrCreate_select.delayMillis, this.findOrCreate_buffered_select_processBuf.bind(this));

        //db.connect is synchronous inside
        db.connect(connectionString, (pool) => {
            this.dbPool_ = pool;
        }, (e) => {
            throw new LedgerException("connect.onError: " + e);
        }, this.MAX_CONNECTIONS);
    }

    addTimer(delay, block) {
        let i = this.timers_.length;
        let f = () => {
            block();
            this.timers_[i] = trs.timeout(delay, f);
        };
        this.timers_[i] = trs.timeout(delay, f);
    }

    /**
     * Get the record by its id
     *
     * @param id to retreive
     * @return instance or null if not found
     */
    getRecord(id) {
        return new Promise((resolve, reject) => {
            //let cached = this.getFromCache(id);
            //if (cached != null)
            //    resolve(cached);
            //else
                this.dbPool_.withConnection(con => {
                    con.executeQuery(qr => {
                            let row = qr.getRows(1)[0];
                            con.release();

                            if (row != null) {
                                let record = StateRecord.initFrom(this, row);
                                //putToCache(record);
                                if (record.isExpired()) {
                                    record.destroy();
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
                        id.digest
                    );
                });
        });
    }

    /**
     * Create a record in {@link ItemState#LOCKED_FOR_CREATION} state locked by creatorRecordId. Does not check
     * anything, the business logic of it is in the {@link StateRecord}. Still, if a database logic prevents creation of
     * a lock record (e.g. hash is already in use), it must return null.
     *
     * @param creatorRecordId record that want to create new item
     * @param newItemHashId   new item hash
     * @return ready saved instance or null if it can not be created (e.g. already exists)
     */
    createOutputLockRecord(creatorRecordId, newItemHashId) {
    }

    /**
     * Get the record that owns the lock. This method should only return the record, not analyze it or somehow process. Still
     * it never returns expired records. Note that <b>caller must clear the lock</b> if this method returns null.
     *
     * @param rc locked record.
     * @return the record or null if none found
     */
    getLockOwnerOf(rc) {
    }

    /**
     * Create new record for a given id and set it to the PENDING state. Normally, it is used to create new root
     * documents. If the record exists, it returns it. If the record does not exists, it creates new one with {@link
        * ItemState#PENDING} state. The operation must be implemented as atomic.
     *
     * @param itemId hashId to register, or null if it is already in use
     * @return found or created {@link StateRecord}
     */
    findOrCreate(itemId) {
        if (this.bufParams.findOrCreate.enabled)
            return this.findOrCreate_buffered(itemId);
        else
            return this.findOrCreate_simple(itemId);
    }

    findOrCreate_simple(itemId) {
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
        }).then(() => {
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
        });
    }

    findOrCreate_buffered(itemId) {
        return this.findOrCreate_buffered_insert(itemId).then(() => {
            return this.findOrCreate_buffered_select(itemId);
        });
    }

    findOrCreate_buffered_insert(itemId) {
        if (this.bufParams.findOrCreate_insert.enabled) {
            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});
            this.bufParams.findOrCreate_insert.buf.push([itemId.digest, resolver, rejecter]);
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
        let processBuf = (withTail) => {
            let arrOfBufs = [];
            let arrOfBufs_length = Math.floor(this.bufParams.findOrCreate_insert.buf.length / this.bufParams.findOrCreate_insert.bufSize) + withTail ? 1 : 0;
            for (let i = 0; i < arrOfBufs_length; ++i) {
                let arr = [];
                for (let j = i*this.bufParams.findOrCreate_insert.bufSize;
                     j < Math.min((i+1)*this.bufParams.findOrCreate_insert.bufSize, this.bufParams.findOrCreate_insert.buf.length);
                     ++j) {
                    arr.push(this.bufParams.findOrCreate_insert.buf[j]);
                }
                arrOfBufs.push(arr);
            }
            for (let i = 0; i < arrOfBufs.length; ++i) {
                let arr = arrOfBufs[i];

                this.dbPool_.withConnection(con => {
                    let queryValues = [];
                    let params = [];
                    for (let j = 0; j < arr.length; ++j) {
                        queryValues.push("(?, 1, extract(epoch from timezone('GMT', now())), extract(epoch from timezone('GMT', now() + interval '5 minute')), NULL)");
                        // queryValues.push("(?,1,?,?,NULL)");
                        params.push(arr[j][0]);
                        // params.push(Math.floor(new Date().getTime()/1000));
                        // params.push(Math.floor(new Date().getTime()/1000) + 5*60);
                    }
                    let queryString = "INSERT INTO ledger(hash, state, created_at, expires_at, locked_by_id) VALUES "+queryValues.join(",")+" ON CONFLICT (hash) DO NOTHING;";
                    con.executeUpdate(affectedRows => {
                        let isAllInserted = (affectedRows == arr.length);
                        con.release();
                        for (let j = 0; j < arr.length; ++j) {
                            if (isAllInserted)
                                arr[j][1](); // call resolver
                            else
                                arr[j][2]("findOrCreate_buffered_insert_processBuf error: only "+affectedRows+" rows from "+arr.length+" has inserted"); // call rejecter
                        }
                    }, e => {
                        con.release();
                        for (let j = 0; j < arr.length; ++j)
                            arr[j][2](e); // call rejecter

                    }, queryString, ...params);
                });
            }
            let newBuf = [];
            if (!withTail) {
                for (let i = arrOfBufs_length * this.bufParams.findOrCreate_insert.bufSize; i < this.bufParams.findOrCreate_insert.buf.length; ++i)
                    newBuf.push(this.bufParams.findOrCreate_insert.buf[i]);
            }
            this.bufParams.findOrCreate_insert.buf = newBuf;
        };

        let now = new Date().getTime();
        if (now - this.bufParams.findOrCreate_insert.ts >= this.bufParams.findOrCreate_insert.delayMillis) {
            processBuf(true);
            this.bufParams.findOrCreate_insert.ts = now;
        } else if (this.bufParams.findOrCreate_insert.buf.length >= this.bufParams.findOrCreate_insert.bufSize) {
            processBuf(false);
            this.bufParams.findOrCreate_insert.ts = now;
        } else {
            // waiting for future messages, do nothing
        }
    }

    findOrCreate_buffered_select(itemId) {
        if (this.bufParams.findOrCreate_select.enabled) {
            let resolver, rejecter;
            let promise = new Promise((resolve, reject) => {resolver = resolve; rejecter = reject;});
            this.bufParams.findOrCreate_select.buf.push([itemId.digest, resolver, rejecter]);
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
        let processBuf = (withTail) => {
            let arrOfBufs = [];
            let arrOfBufs_length = Math.floor(this.bufParams.findOrCreate_select.buf.length / this.bufParams.findOrCreate_select.bufSize) + withTail ? 1 : 0;
            for (let i = 0; i < arrOfBufs_length; ++i) {
                let arr = [];
                for (let j = i*this.bufParams.findOrCreate_select.bufSize;
                     j < Math.min((i+1)*this.bufParams.findOrCreate_select.bufSize, this.bufParams.findOrCreate_select.buf.length);
                     ++j) {
                    arr.push(this.bufParams.findOrCreate_select.buf[j]);
                }
                arrOfBufs.push(arr);
            }
            for (let i = 0; i < arrOfBufs.length; ++i) {
                let arr = arrOfBufs[i];

                this.dbPool_.withConnection(con => {
                    let queryValues = [];
                    let params = [];
                    for (let j = 0; j < arr.length; ++j) {
                        queryValues.push("?");
                        params.push(arr[j][0]);
                    }
                    let queryString = "SELECT * FROM ledger WHERE hash IN ("+queryValues.join(",")+") LIMIT "+params.length+";";
                    con.executeQuery(qr => {
                        let rows = qr.getRows(0);
                        let names = qr.getColNamesMap();
                        con.release();
                        let resolversMap = {};
                        for (let j = 0; j < arr.length; ++j)
                            resolversMap[arr[j][0]] = arr[j][1];
                        for (let j = 0; j < rows.length; ++j)
                            resolversMap[rows[j][names["hash"]]](rows[j]); // call resolver
                    }, e => {
                        con.release();
                        for (let j = 0; j < arr.length; ++j)
                            arr[j][2](e); // call rejecter

                    }, queryString, ...params);
                });
            }
            let newBuf = [];
            if (!withTail) {
                for (let i = arrOfBufs_length * this.bufParams.findOrCreate_select.bufSize; i < this.bufParams.findOrCreate_select.buf.length; ++i)
                    newBuf.push(this.bufParams.findOrCreate_select.buf[i]);
            }
            this.bufParams.findOrCreate_select.buf = newBuf;
        };

        let now = new Date().getTime();
        if (now - this.bufParams.findOrCreate_select.ts >= this.bufParams.findOrCreate_select.delayMillis) {
            processBuf(true);
            this.bufParams.findOrCreate_select.ts = now;
        } else if (this.bufParams.findOrCreate_select.buf.length >= this.bufParams.findOrCreate_select.bufSize) {
            processBuf(false);
            this.bufParams.findOrCreate_select.ts = now;
        } else {
            // waiting for future messages, do nothing
        }
    }

    /**
     * Shortcut method: check that record exists and its state returns {@link ItemState#isApproved()}}. Check it to
     * ensure its meaning.
     *
     * @param id is {@link HashId} for checking item
     * @return true if it is.
     */
    isApproved(id) {
    }

    /**
     * Shortcut method: check that record exists and its state returns {@link ItemState#isConsensusFound()}}. Check it to
     * ensure its meaning.
     *
     * @param id is {@link HashId} for checking item
     * @return true if it is.
     */
    isConsensusFound(id) {
    }

    /**
     * Perform a callable in a transaction. If the callable throws any exception, the transaction should be rolled back
     * to its initial state. Blocks until the callable returns, and returns what the callable returns. If an exception
     * is thrown by the callable, the transaction is rolled back and the exception will be rethrown unless it was a
     * {@link Rollback} instance, which just rollbacks the transaction, in which case it always return null.
     *
     * @param block to execute
     * @return null if transaction is rolled back throwing a {@link Rollback} exception, otherwise what callable
     * returns.
     */
    transaction(block) {
    }

    /**
     * Destroy the record and free space in the ledger.
     *
     * @param record is {@link StateRecord} to destroy
     */
    destroy(record) {
    }

    /**
     * save a record into the ledger
     *
     * @param stateRecord is {@link StateRecord} to save
     */
    save(stateRecord) {
    }

    /**
     * Refresh record.
     *
     * @param stateRecord is {@link StateRecord} to reload
     * @throws StateRecord.NotFoundException as itself
     */
    reload(stateRecord) {
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
        Object.keys(this.bufParams).forEach((key) => {
            if ("delayMillis" in this.bufParams[key])
                if (delay < this.bufParams[key].delayMillis)
                    delay = this.bufParams[key].delayMillis;
        });
        await sleep(200+delay*1.5);
    }

    countRecords() {
    }

    getLockOwnerOf(itemId) {
    }

    getLedgerSize(createdAfter = 0) {
        return new Promise((resolve, reject) => {
            this.dbPool_.withConnection(con => {
                con.executeQuery(qr => {
                        let res = {};
                        let rows = qr.getRows(0);
                        rows.forEach((r, i, arr) => {
                            res[r[1]] = r[0];
                        });
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

    savePayment(amount, date) {
    }

    getPayments(fromDate) {
    }




    markTestRecord(hash){}

    isTestnet(itemId){}

    updateSubscriptionInStorage(id, expiresAt) {}
    updateStorageExpiresAt(storageId, expiresAt) {}
    saveFollowerEnvironment(environmentId, expiresAt, mutedAt, spent, startedCallbacks) {}

    updateNameRecord(id, expiresAt) {}

    saveEnvironment(environment) {}

    findBadReferencesOf(ids) {}

    saveConfig(myInfo, netConfig, nodeKey) {}
    loadConfig() {}
    addNode(nodeInfo) {}
    removeNode(nodeInfo) {}
    findUnfinished() {}

    getItem(record) {}
    putItem(record, item, keepTill) {}

    getKeepingItem(itemId) {}
    putKeepingItem(record, item) {}
    getKeepingByOrigin(origin, limit) {}

    getEnvironment(environmentId) {}
    getEnvironment(contractId) {}
    getEnvironment(smartContract) {}

    updateEnvironment(id, ncontractType, ncontractHashId, kvStorage, transactionPack) {}

    saveContractInStorage(contractId, binData, expiresAt, origin, environmentId) {}

    saveSubscriptionInStorage(hashId, subscriptionOnChain, expiresAt, environmentId) {}

    getSubscriptionEnviromentIds(id) {}

    getFollowerCallbackStateById(id) {}
    getFollowerCallbacksToResyncByEnvId(environmentId) {}
    getFollowerCallbacksToResync() {}
    addFollowerCallback(id, environmentId, expiresAt, storedUntil) {}
    updateFollowerCallbackState(id, state) {}
    removeFollowerCallback(id) {}

    clearExpiredStorages() {}
    clearExpiredSubscriptions() {}
    clearExpiredStorageContractBinaries() {}

    getSmartContractById(smartContractId) {}
    getContractInStorage(contractId) {}
    getContractInStorage(slotId, contractId) {}
    getContractsInStorageByOrigin(slotId, originId) {}

    removeEnvironmentSubscription(subscriptionId) {}
    removeEnvironmentStorage(storageId) {}
    removeEnvironment(ncontractHashId) {}
    removeExpiredStoragesAndSubscriptionsCascade() {}

    addNameRecord(nameRecordModel) {}
    removeNameRecord(nameReduced) {}
    getNameRecord(nameReduced) {}
    getNameByAddress(address) {}
    getNameByOrigin(origin) {}
    isAllNameRecordsAvailable(reducedNames) {}
    isAllOriginsAvailable(origins) {}
    isAllAddressesAvailable(addresses) {}
    clearExpiredNameRecords(holdDuration) {}

    cleanup(isPermanetMode) {}
}

module.exports = {Ledger};
