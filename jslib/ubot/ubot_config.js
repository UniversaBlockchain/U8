class UBotConfig {
    static ledger_max_connections = 16;
    static send_starting_contract_period = 4000; // ms

    static single_storage_vote_period = 1000; // ms
    static multi_storage_vote_period = 2000; // ms
}

module.exports = {UBotConfig};