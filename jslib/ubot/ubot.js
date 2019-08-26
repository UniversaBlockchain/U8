const CloudProcessor = require("ubot/cloudprocessor").CloudProcessor;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const ExecutorService = require("executorservice").ExecutorService;
const UBotCloudNotification = require("ubot/ubot_notification").UBotCloudNotification;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const UBotResultCache = require("ubot/ubot_result_cache").UBotResultCache;

class UBot {
    constructor(logger, network, ledger) {
        //this.logger = logger;
        this.logger = {log: text => logger.log("UBot"+network.myInfo.number+": " + text)};
        this.ledger = ledger;
        this.network = network;
        this.processors = new Map();
        this.resultCache = new UBotResultCache(UBotConfig.maxResultCacheAge);
        this.executorService = new ExecutorService();
    }

    async shutdown() {
        //this.logger.log("UBot.shutdown()...");
        this.resultCache.shutdown();
        this.executorService.shutdown();
    }

    executeCloudMethod(contract) {
        this.logger.log("executeCloudMethod: startingContract.id = " + contract.id);
        this.logger.log("  contract.state.data: " + JSON.stringify(contract.state.data));
        let processor = new CloudProcessor(UBotPoolState.SEND_STARTING_CONTRACT, contract.id, this);
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

        } else if (notification.type === UBotCloudNotification.types.DOWNLOAD_STARTING_CONTRACT && !notification.isAnswer) {
            let processor = new CloudProcessor(UBotPoolState.INIT, notification.poolId, this);
            processor.onNotifyInit(notification);
            this.processors.set(notification.poolId.base64, processor);

        } else
            this.logger.log("Warning: unknown notification. Type = " + notification.type.ordinal + " isAnswer = " + notification.isAnswer);
    }

    getStartingContract(hashId) {
        if (this.processors.has(hashId.base64)) {
            let proc = this.processors.get(hashId.base64);
            if (proc.startingContract != null)
                return proc.startingContract;
        }
        return null;
    }

    getSelectedPoolNumbers(hashId) {
        if (this.processors.has(hashId.base64)) {
            let proc = this.processors.get(hashId.base64);
            let res = [];
            proc.pool.forEach(i => res.push(i.number));
            return res;
        }
        return null;
    }

    async getStorageResult(hash, multi) {
        let result = this.resultCache.get(hash);
        if (result != null)
            return result;

        if (multi)
            result = await this.ledger.getMultiStorageDataByHash(hash);
        else
            result = await this.ledger.getSingleStorageDataByHash(hash);

        return result;
    }
}

module.exports = {UBot};
