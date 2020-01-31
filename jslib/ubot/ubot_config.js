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
    static maxCloudProcessorsCacheAge = 20*60; //20 minutes
    static maxResultDownloadAttempts = 5;

    static maxDownloadActualStorageResultTime = 10000; // ms
    static maxDownloadRequestTime = 40000; // ms
    static clientMaxWaitSession = 60000; // ms

    static waitPeriod = 100; // ms
    static waitNodeForTransaction = 5000; // ms

    static storageReadTrustLevel = 0.3;
    static checkSessionTrustLevel = 0.3;

    static checkQuantiserPeriod = 300; // ms
    static requestExpiredTime = 86400000; // ms

    static getNetworkPositiveConsensus(count) {
        if (count < 3)
            return count;
        else if (count < 10)
            return count - 1;
        else
            return Math.ceil(count * 0.9);
    }

    static getNetworkNegativeConsensus(count) {
        if (count < 3)
            return 1;
        else if (count < 10)
            return 2;
        else
            return count + 1 - Math.ceil(count * 0.9);
    }
}

module.exports = {UBotConfig};