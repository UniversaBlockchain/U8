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

    async writeToSingleStorage(pool_hash_id, executable_contract_id, storage_name, storage_data) {
        //console.log("pool_hash_id = " + pool_hash_id.digest);
        //console.log("executable_contract_id = " + executable_contract_id.digest);
        //console.log("storage_name = " + storage_name);
        //console.log("storage_data = " + storage_data);

        return this.simpleQuery(
            "INSERT INTO pool_storage (pool_hash_id, executable_contract_id, storage_name, storage_type, single_storage_data) " +
            " VALUES (?,?,?,?,?) ON CONFLICT (pool_hash_id, storage_name) DO UPDATE SET executable_contract_id=EXCLUDED.executable_contract_id, " +
            "storage_type=EXCLUDED.storage_type, single_storage_data=EXCLUDED.single_storage_data RETURNING id",
            x => {
                if (x == null)
                    throw new UBotLedgerException("writeToSingleStorage failed: returning null");
                else
                    return Number(x);
            },
            null,
            pool_hash_id.digest,
            executable_contract_id.digest,
            storage_name,
            UBotStorageType.SINGLE.ordinal,
            storage_data);
    }
}

module.exports = {UBotLedger};
