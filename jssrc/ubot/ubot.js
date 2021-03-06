/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const CloudProcessor = require("ubot/cloudprocessor").CloudProcessor;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const ExecutorService = require("executorservice").ExecutorService;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const UBotResultCache = require("ubot/ubot_result_cache").UBotResultCache;
const UBotCloudProcessorsCache = require("ubot/ubot_cloudprocessors_cache").UBotCloudProcessorsCache;
const UBotStorageType = require("ubot/ubot_ledger").UBotStorageType;
const UBotClient = require('ubot/ubot_client').UBotClient;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const Lock = require("lock").Lock;
const Boss = require('boss.js');
const t = require("tools");

const TOPOLOGY_FILE = "mainnet_topology.json";

class UBot {
    constructor(logger, network, ledger, nodeKey, configRoot) {
        //this.logger = logger;
        this.logger = {log: text => logger.log("UBot"+network.myInfo.number+": " + text)};
        this.ledger = ledger;
        this.network = network;
        this.processors = new Map();
        this.resultCache = new UBotResultCache(UBotConfig.maxResultCacheAge);
        this.cloudProcessorsCache = new UBotCloudProcessorsCache(this, UBotConfig.maxCloudProcessorsCacheAge);
        //this.sessionStorageCache = new UBotSessionStorageCache(UBotConfig.maxResultCacheAge);
        this.executorService = new ExecutorService();
        this.nodeKey = nodeKey;
        this.configRoot = configRoot;
        this.client = null;
        this.lock = new Lock();
    }

    async shutdown() {
        // waiting processors finished...
        // while (Array.from(this.processors.values()).some(proc => proc.state.canContinue)) {
        //     console.error(JSON.stringify(Array.from(this.processors.values()).map(proc => proc.state.val)));
        //     await sleep(UBotConfig.waitPeriod);
        // }

        this.resultCache.shutdown();
        this.cloudProcessorsCache.shutdown();
        //this.sessionStorageCache.shutdown();
        this.executorService.shutdown();
        if (this.client != null)
            await this.client.shutdown();
    }

    async executeCloudMethod(contract) {
        if (this.processors.has(contract.id.base64))
            return;

        await this.lock.synchronize(contract.id, async () => {
            if (!this.processors.has(contract.id.base64)) {
                this.logger.log("executeCloudMethod: requestContract.id = " + contract.id);
                this.logger.log("  contract.state.data: " + t.secureStringify(contract.state.data));

                if (this.client == null)
                    this.client = await new UBotClient(this.nodeKey, this.configRoot + TOPOLOGY_FILE, null,
                        UBotConfig.clientMaxWaitSession, this.logger).start();

                let session = await this.client.checkSession(contract.state.data.executable_contract_id, contract.id, this.network.myInfo.number, this);
                this.logger.log("executeCloudMethod session: " + session);

                let processor = new CloudProcessor(UBotPoolState.SEND_STARTING_CONTRACT, contract.id, this, session);
                processor.requestContract = contract;
                processor.startProcessingCurrentState();

                this.logger.log("Create cloud processor " + contract.id);
                this.processors.set(contract.id.base64, processor);
            }
        });
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

            await this.lock.synchronize(notification.poolId, async () => {
                if (!this.processors.has(notification.poolId.base64)) {
                    if (this.client == null)
                        this.client = await new UBotClient(this.nodeKey, this.configRoot + TOPOLOGY_FILE, null,
                            UBotConfig.clientMaxWaitSession, this.logger).start();

                    let session = null;
                    try {
                        session = await this.client.checkSession(notification.executableContractId, notification.poolId, this.network.myInfo.number, this);
                    } catch (err) {
                        this.logger.log("Error: check session failed, ubot is not started by notification: " + notification.poolId +
                            ", message: " + err.message);
                        return;
                    }

                    this.logger.log("onCloudNotify session checked: " + session);

                    let processor = new CloudProcessor(UBotPoolState.INIT, notification.poolId, this, session);
                    processor.onNotifyInit(notification);

                    this.logger.log("Create cloud processor " + notification.poolId);
                    this.processors.set(notification.poolId.base64, processor);
                }
            });

        } else
            this.logger.log("Warning: unknown notification. Type = " + notification.type.ordinal + ", Type code = " + notification.typeCode);
    }

    getRequestContract(hashId) {
        if (this.processors.has(hashId.base64)) {
            let proc = this.processors.get(hashId.base64);
            if (proc.requestContract != null)
                return proc.requestContract;
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

    async getStorageResultByRecordId(recordId, type, ubotNumber = undefined) {
        let result = await this.getStoragePackedResultByRecordId(recordId, type, ubotNumber);
        if (result == null)
            return null;

        return await BossBiMapper.getInstance().deserialize(await Boss.load(result));
    }

    async getStoragePackedResultByRecordId(recordId, type, ubotNumber = undefined) {
        let result = this.resultCache.get(recordId, ubotNumber);
        if (result != null)
            return result;

        if (type === UBotStorageType.MULTI)
            result = await this.ledger.getMultiStorageDataByRecordId(recordId, ubotNumber);
        else if (type === UBotStorageType.SINGLE)
            result = await this.ledger.getSingleStorageDataByRecordId(recordId);
        else if (type === UBotStorageType.LOCAL)
            result = await this.ledger.getLocalStorageDataByRecordId(recordId);

        return result;
    }

    async getAllRecordsFromMultiStorage(executable_contract_id, storage_name) {
        let records = await this.ledger.getAllRecordsFromMultiStorage(executable_contract_id, storage_name);

        //sort records
        records.sort((a, b) => a.ubot_number - b.ubot_number);

        let result = [];
        for (let record of records)
            result.push(await BossBiMapper.getInstance().deserialize(await Boss.load(record.storage_data)));

        return result;
    }

    async getRecordsFromMultiStorageByRecordId(recordId, packed = false) {
        let records = this.resultCache.get(recordId);
        if (records == null)
            records = await this.ledger.getRecordsFromMultiStorageByRecordId(recordId);
        else {
            // convert cache Map to array similar to the one returned from the ledger
            let results = [];
            for (let [ubot_number, data] of records)
                results.push({
                    storage_data: data,
                    hash: crypto.HashId.of(data),
                    ubot_number: ubot_number
                });

            records = results;
        }

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
                results.push(await BossBiMapper.getInstance().deserialize(await Boss.load(record.storage_data)));

            ubots.push(record.ubot_number);
            concat.set(record.hash.digest, i * record.hash.digest.length);
            i++;
        }

        return {
            records: results,
            cortegeId: crypto.HashId.of(concat),
            ubots: ubots
        };
    }

    static getDefaultRecordId(executableContractId, storageName, type) {
        let storageId = crypto.HashId.of(storageName);
        let concat = new Uint8Array(executableContractId.digest.length + storageId.digest.length + 1);
        concat[0] = type.ordinal;
        concat.set(executableContractId.digest, 1);
        concat.set(storageId.digest, executableContractId.digest.length + 1);

        return crypto.HashId.of(concat);
    }

    async getStorages(executableContractId, storageNames) {
        if (storageNames == null || storageNames === "default")
            return await this.getStorage(executableContractId, "default");

        let storage = {};
        for (let storageName of storageNames)
            storage[storageName] = await this.getStorage(executableContractId, storageName);

        return storage;
    }

    async getStorage(executableContractId, storageName) {
        let storage = {};

        // multi storage
        let recordId = UBot.getDefaultRecordId(executableContractId, storageName, UBotStorageType.MULTI);
        let result = await this.getRecordsFromMultiStorageByRecordId(recordId);

        if (result != null) {
            storage.multi = [];
            for (let i = 0; i < result.records.length; i++)
                storage.multi.push({ubot_number: result.ubots[i], result: result.records[i]});
        } else
            storage.multi = null;

        // single storage
        recordId = UBot.getDefaultRecordId(executableContractId, storageName, UBotStorageType.SINGLE);
        storage.single = await this.getStorageResultByRecordId(recordId, UBotStorageType.SINGLE);

        return storage;
    }
}

module.exports = {UBot};
