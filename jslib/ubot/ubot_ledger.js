const UBotConfig = require("ubot/ubot_config").UBotConfig;
import * as db from "pg_driver";

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
        //await db.MigrationDriver.createDB(this.dbPool_, "../jslib/ubot/migrations/postgres");
    }

    async close() {
        this.dbPool_.close();
    }

    async writeToStorage(pool_hash_id, executable_contract_id, storage_name, storage_data) {
        //console.log("pool_hash_id = " + pool_hash_id);
        //console.log("executable_contract_id = " + executable_contract_id);
        //console.log("storage_name = " + storage_name);
        //console.log("storage_data = " + storage_data);
    }
}

module.exports = {UBotLedger};
