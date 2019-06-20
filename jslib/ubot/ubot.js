const t = require("tools");
const CloudProcessor = require("ubot/cloudprocessor").CloudProcessor;
const UBotPoolState = require("ubot/cloudprocessor").UBotPoolState;
const ExecutorService = require("executorservice").ExecutorService;

class UBot {
    constructor(logger, network) {
        //this.logger = logger;
        this.logger = {log: text => logger.log("UBot"+network.myInfo.number+": " + text)};

        this.network = network;
        this.processors = new Map();
        this.executorService = new ExecutorService();
    }

    async shutdown() {
        //this.logger.log("UBot.shutdown()...");
    }

    executeCloudMethod(contract) {
        this.logger.log("executeCloudMethod: id = " + contract.id.base64);
        this.logger.log("  contract.state.data: " + JSON.stringify(contract.state.data));
        let processor = new CloudProcessor(UBotPoolState.SEND_STARTING_CONTRACT, contract.id, this);
        processor.startingContract = contract;
        processor.startProcessingCurrentState();
        this.processors.set(contract.id.base64, processor);
    }

    /**
     * UBotCloudNotification has received;
     * @param notify UBotCloudNotification
     */
    onCloudNotify(notification) {
        if (this.processors.has(notification.poolId.base64)) {
            this.processors.get(notification.poolId.base64).onNotify(notification);
        } else {
            let processor = new CloudProcessor(UBotPoolState.INIT, notification.poolId, this);
            processor.onNotifyInit(notification);
            this.processors.set(notification.poolId.base64, processor);
        }
    }

    getStartingContract(hashId) {
        if (this.processors.has(hashId.base64)) {
            let proc = this.processors.get(hashId.base64);
            if (proc.startingContract != null)
                return proc.startingContract;
        }
        return null;
    }

}

module.exports = {UBot};
