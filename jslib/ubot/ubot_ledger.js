const UBotConfig = require("ubot/ubot_config").UBotConfig;
import * as db from "pg_driver";

const UBotStorageType = {
    SINGLE : {ordinal: 0},
    MULTI  : {ordinal: 1}
};

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
        await db.MigrationDriver.createDB(this.dbPool_, "../jslib/ubot/migrations/postgres");
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

    async writeToMultiStorage(executable_contract_id, storage_name, storage_data, hash, record_id, ubot_number) {
        let id = await this.findOrCreateStorage(executable_contract_id, storage_name, UBotStorageType.MULTI);

        return this.simpleQuery(
            "INSERT INTO multi_records (record_id, storage_id, storage_data, hash, ubot_number) VALUES (?,?,?,?,?) " +
            "ON CONFLICT (record_id, storage_id) DO NOTHING RETURNING record_id",
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
}

module.exports = {UBotLedger};
