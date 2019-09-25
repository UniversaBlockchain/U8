/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const CloudProcessor = require("ubot/cloudprocessor").CloudProcessor;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const ExecutorService = require("executorservice").ExecutorService;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const UBotResultCache = require("ubot/ubot_result_cache").UBotResultCache;
const UBotClient = require('ubot/ubot_client').UBotClient;
const Boss = require('boss.js');

const TOPOLOGY_ROOT = "../jslib/ubot/topology/";

class UBot {
    constructor(logger, network, ledger, nodeKey) {
        //this.logger = logger;
        this.logger = {log: text => logger.log("UBot"+network.myInfo.number+": " + text)};
        this.ledger = ledger;
        this.network = network;
        this.processors = new Map();
        this.resultCache = new UBotResultCache(UBotConfig.maxResultCacheAge);
        this.executorService = new ExecutorService();
        this.nodeKey = nodeKey;
        this.client = null;
    }

    async shutdown() {
        //this.logger.log("UBot.shutdown()...");
        this.resultCache.shutdown();
        this.executorService.shutdown();
        if (this.client != null)
            await this.client.shutdown();
    }

    async executeCloudMethod(contract) {
        this.logger.log("executeCloudMethod: startingContract.id = " + contract.id);
        this.logger.log("  contract.state.data: " + JSON.stringify(contract.state.data));

        if (this.client == null)
            this.client = await new UBotClient(this.nodeKey, TOPOLOGY_ROOT + "universa.pro.json").start();

        let session = await this.client.checkSession(contract.state.data.executable_contract_id, contract.id, this.network.myInfo.number);
        this.logger.log("executeCloudMethod session: " + session);

        let processor = new CloudProcessor(UBotPoolState.SEND_STARTING_CONTRACT, contract.id, this, session);
        processor.startingContract = contract;
        processor.startProcessingCurrentState();
        this.processors.set(contract.id.base64, processor);
    }

    /**
     * UBotCloudNotification has received;
     * @param notification UBotCloudNotification
     */
    async onCloudNotify(notification) {
        if (this.processors.has(notification.poolId.base64)) {
            await this.processors.get(notification.poolId.base64).onNotify(notification);

        } else if (notification instanceof UBotCloudNotification &&
            notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT && !notification.isAnswer) {

            if (this.client == null)
                this.client = await new UBotClient(this.nodeKey, TOPOLOGY_ROOT + "universa.pro.json").start();

            let session = null;
            try {
                session = await this.client.checkSession(notification.executableContractId, notification.poolId, this.network.myInfo.number);
            } catch (err) {
                this.logger.log("Error: check session failed, ubot is not started by notification: " + notification.poolId.base64 +
                    ", message: " + err.message);
                return;
            }

            this.logger.log("onCloudNotify session checked: " + session);

            let processor = new CloudProcessor(UBotPoolState.INIT, notification.poolId, this, session);
            processor.onNotifyInit(notification);
            this.processors.set(notification.poolId.base64, processor);

        } else
            this.logger.log("Warning: unknown notification. Type = " + notification.type.ordinal + ", Type code = " + notification.typeCode);
    }

    getStartingContract(hashId) {
        if (this.processors.has(hashId.base64)) {
            let proc = this.processors.get(hashId.base64);
            if (proc.startingContract != null)
                return proc.startingContract;
        }
        return null;
    }

    // getSelectedPoolNumbers(hashId) {
    //     if (this.processors.has(hashId.base64)) {
    //         let proc = this.processors.get(hashId.base64);
    //         let res = [];
    //         proc.pool.forEach(i => res.push(i.number));
    //         return res;
    //     }
    //     return null;
    // }

    async getStoragePackedResultByHash(hash, multi) {
        let result = this.resultCache.get(hash);
        if (result != null)
            return result;

        if (multi)
            result = await this.ledger.getMultiStorageDataByHash(hash);
        else
            result = await this.ledger.getSingleStorageDataByHash(hash);

        return result;
    }

    async getStorageResultByRecordId(recordId, multi, ubotNumber = undefined) {
        let result = this.resultCache.get(recordId, ubotNumber);
        if (result != null)
            return await Boss.load(result);

        if (multi)
            result = await Boss.load(await this.ledger.getMultiStorageDataByRecordId(recordId, ubotNumber));
        else
            result = await Boss.load(await this.ledger.getSingleStorageDataByRecordId(recordId));

        return result;
    }

    async getStoragePackedResultByRecordId(recordId, multi, ubotNumber = undefined) {
        let result = this.resultCache.get(recordId, ubotNumber);
        if (result != null)
            return result;

        if (multi)
            result = await this.ledger.getMultiStorageDataByRecordId(recordId, ubotNumber);
        else
            result = await this.ledger.getSingleStorageDataByRecordId(recordId);

        return result;
    }

    async getAllRecordsFromMultiStorage(executable_contract_id, storage_name) {
        let records = await this.ledger.getAllRecordsFromMultiStorage(executable_contract_id, storage_name);

        //sort records
        records.sort((a, b) => a.ubot_number - b.ubot_number);

        let result = [];
        for (let record of records)
            result.push(await Boss.load(record.storage_data));

        return result;
    }

    async getRecordsFromMultiStorageByRecordId(recordId, packed = false) {
        let records = await this.ledger.getRecordsFromMultiStorageByRecordId(recordId);

        if (records.length === 0)
            return null;

        //sort records
        records.sort((a, b) => a.ubot_number - b.ubot_number);

        let results = [];
        let ubots = [];
        let i = 0;
        let concat = new Uint8Array(records.length * records[0].hash.digest.length);

        for (let record of records) {
            if (packed)
                results.push(record.storage_data);
            else
                results.push(await Boss.load(record.storage_data));

            ubots.push(record.ubot_number);
            concat.set(record.hash.digest, i * record.hash.digest);
            i++;
        }

        return {
            records: results,
            cortegeId: crypto.HashId.of(concat),
            ubots: ubots
        };
    }
}

module.exports = {UBot};
