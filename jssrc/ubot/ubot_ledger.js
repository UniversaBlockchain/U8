/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const UBotConfig = require("ubot/ubot_config").UBotConfig;
import * as db from "pg_driver";

const UBotStorageType = {
    SINGLE : {ordinal: 0, val: "SINGLE", description: "pool-bound storage"},
    MULTI  : {ordinal: 1, val: "MULTI", description: "worker-bound storage"},
    LOCAL  : {ordinal: 2, val: "LOCAL", description: "local storage"}
};

UBotStorageType.byOrdinal = new Map();
UBotStorageType.byOrdinal.set(UBotStorageType.SINGLE.ordinal, UBotStorageType.SINGLE);
UBotStorageType.byOrdinal.set(UBotStorageType.MULTI.ordinal, UBotStorageType.MULTI);
UBotStorageType.byOrdinal.set(UBotStorageType.LOCAL.ordinal, UBotStorageType.LOCAL);

class UBotLedgerException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class UBotLedger {
    constructor(logger, connectionString) {
        this.logger = logger;

        //db.connect is synchronous inside
        db.connect(connectionString, (pool) => {
            this.dbPool_ = pool;
        }, (e) => {
            logger.log("error: connect.onError: " + e);
            throw new UBotLedgerException("connect.onError: " + e);
        }, UBotConfig.ledger_max_connections);
    }

    async init() {
        await db.MigrationDriver.createDB(this.dbPool_, "jssrc/ubot/migrations/postgres");
    }

    async close() {
        this.dbPool_.close();
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

                        if (processValue != null) {
                            try {
                                resolve(await processValue(value));
                            } catch (err) {
                                reject(err);
                            }
                        } else
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

    async getSingleStorageDataByHash(hash) {
        return this.simpleQuery(
            "SELECT storage_data FROM single_records WHERE hash = ? LIMIT 1",
            null,
            null,
            hash.digest);
    }

    async getMultiStorageDataByHash(hash) {
        return this.simpleQuery(
            "SELECT storage_data FROM multi_records WHERE hash = ? LIMIT 1",
            null,
            null,
            hash.digest);
    }

    async getSingleStorageDataByRecordId(recordId) {
        return this.simpleQuery(
            "SELECT storage_data FROM single_records WHERE record_id = ? LIMIT 1",
            null,
            null,
            recordId.digest);
    }

    async getMultiStorageDataByRecordId(recordId, ubotNumber) {
        return this.simpleQuery(
            "SELECT storage_data FROM multi_records WHERE record_id = ? AND ubot_number = ? LIMIT 1",
            null,
            null,
            recordId.digest,
            ubotNumber);
    }

    async findOrCreateStorage(executable_contract_id, storage_name, storage_type) {
        let id = await this.simpleQuery(
            "SELECT id FROM storage WHERE executable_contract_id = ? AND storage_name = ? AND storage_type = ?",
            x => {
                if (x == null)
                    return null;
                else
                    return Number(x);
            },
            null,
            executable_contract_id.digest,
            storage_name,
            storage_type.ordinal);

        if (id != null)
            return id;

        return await this.simpleQuery(
            "INSERT INTO storage (executable_contract_id, storage_name, storage_type) VALUES (?,?,?) " +
            "ON CONFLICT (executable_contract_id, storage_name, storage_type) DO NOTHING RETURNING id",
            x => {
                if (x == null)
                    throw new UBotLedgerException("findOrCreateStorage failed: returning null");
                else
                    return Number(x);
            },
            null,
            executable_contract_id.digest,
            storage_name,
            storage_type.ordinal);
    }

    async writeToSingleStorage(executable_contract_id, storage_name, storage_data, hash, record_id) {
        let id = await this.findOrCreateStorage(executable_contract_id, storage_name, UBotStorageType.SINGLE);

        return this.simpleQuery(
            "INSERT INTO single_records (record_id, storage_id, storage_data, hash) VALUES (?,?,?,?) " +
            "ON CONFLICT (record_id, storage_id) DO NOTHING RETURNING record_id",
            x => {
                if (x == null)
                    throw new UBotLedgerException("writeToSingleStorage failed: returning null");
                else
                    return x;
            },
            null,
            record_id.digest,
            id,
            storage_data,
            hash.digest);
    }

    async deleteFromSingleStorage(record_id) {
        return this.simpleUpdate(
            "DELETE FROM single_records WHERE record_id = ?",
            null,
            record_id.digest);
    }

    async writeToMultiStorage(executable_contract_id, storage_name, storage_data, hash, record_id, ubot_number) {
        let id = await this.findOrCreateStorage(executable_contract_id, storage_name, UBotStorageType.MULTI);

        return this.simpleQuery(
            "INSERT INTO multi_records (record_id, storage_id, storage_data, hash, ubot_number) VALUES (?,?,?,?,?) " +
            "ON CONFLICT (record_id, ubot_number, storage_id) DO NOTHING RETURNING record_id",
            x => {
                if (x == null)
                    throw new UBotLedgerException("writeToMultiStorage failed: returning null");
                else
                    return x;
            },
            null,
            record_id.digest,
            id,
            storage_data,
            hash.digest,
            ubot_number);
    }

    async deleteFromMultiStorage(record_id) {
        return this.simpleUpdate(
            "DELETE FROM multi_records WHERE record_id = ?",
            null,
            record_id.digest);
    }

    async getAllRecordsFromMultiStorage(executable_contract_id, storage_name) {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
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
                                    result.push({
                                        record_id: crypto.HashId.withDigest(rows[i][0]),
                                        storage_data: rows[i][1],
                                        hash: crypto.HashId.withDigest(rows[i][2]),
                                        ubot_number: Number(rows[i][3])
                                        //storage_ubots: rows[i][4]
                                    });
                        }

                        con.release();
                        resolve(result);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT record_id, storage_data, hash, ubot_number FROM multi_records JOIN storage " +
                    "ON multi_records.storage_id = storage.id WHERE executable_contract_id = ? AND storage_name = ? AND storage_type = ?",
                    executable_contract_id.digest,
                    storage_name,
                    UBotStorageType.MULTI.ordinal
                );
            });
        });
    }

    async getRecordsFromMultiStorageByRecordId(recordId) {
        return new Promise(async(resolve, reject) => {
            this.dbPool_.withConnection(con => {
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
                                    result.push({
                                        storage_data: rows[i][0],
                                        hash: crypto.HashId.withDigest(rows[i][1]),
                                        ubot_number: Number(rows[i][2])
                                        //storage_ubots: rows[i][3]
                                    });
                        }

                        con.release();
                        resolve(result);
                    }, e => {
                        con.release();
                        reject(e);
                    },
                    "SELECT storage_data, hash, ubot_number FROM multi_records WHERE record_id = ?",
                    recordId.digest
                );
            });
        });
    }

    async getLocalStorageDataByRecordId(recordId) {
        return this.simpleQuery(
            "SELECT storage_data FROM local_records WHERE record_id = ? LIMIT 1",
            null,
            null,
            recordId.digest);
    }

    async writeToLocalStorage(executable_contract_id, storage_name, storage_data, record_id) {
        let id = await this.findOrCreateStorage(executable_contract_id, storage_name, UBotStorageType.LOCAL);

        return this.simpleUpdate(
            "INSERT INTO local_records (record_id, storage_id, storage_data) VALUES (?,?,?) " +
            "ON CONFLICT (record_id, storage_id) DO UPDATE SET storage_data = EXCLUDED.storage_data",
            null,
            record_id.digest,
            id,
            storage_data);
    }
}

module.exports = {UBotLedger, UBotStorageType};
