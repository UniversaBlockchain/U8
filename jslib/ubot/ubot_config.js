/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

class UBotConfig {
    static http_server_pool_size = 4; // 32 for production

    static ledger_max_connections = 4; // 64 for production
    static send_starting_contract_period = 4000; // ms

    static single_storage_vote_period = 1000; // ms
    static multi_storage_vote_period = 1000; // ms
    static multi_storage_download_periods = [0, 1000, 1000, 2000, 4000]; // ms

    static maxResultCacheAge = 20*60; //20 minutes
    static maxResultDownloadAttempts = 5;
}

module.exports = {UBotConfig};