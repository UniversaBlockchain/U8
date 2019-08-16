class UBotConfig {
    static http_server_pool_size = 4; // 32 for production

    static ledger_max_connections = 4; // 64 for production
    static send_starting_contract_period = 4000; // ms

    static single_storage_vote_period = 1000; // ms
    static multi_storage_vote_period = 1000; // ms
}

module.exports = {UBotConfig};