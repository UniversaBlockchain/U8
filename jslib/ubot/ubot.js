const t = require("tools");
const CloudProcessor = require("ubot/cloudprocessor").CloudProcessor;
const UBotPoolState = require("ubot/cloudprocessor").UBotPoolState;
const ExecutorService = require("executorservice").ExecutorService;

class UBot {
    constructor(logger, network) {
        this.logger = logger;
        this.network = network;
        this.processors = new t.GenericMap();
        this.executorService = new ExecutorService();
    }

    async shutdown() {
        //this.logger.log("UBot.shutdown()...");
    }

    executeCloudMethod(contract) {
        this.logger.log("executeCloudMethod: id = " + contract.id.base64);
        this.logger.log("  contract.state.data: " + JSON.stringify(contract.state.data));
        let processor = new CloudProcessor(UBotPoolState.SENDING_CLOUD_METHOD, contract, this);
        this.processors.set(contract.id, processor);
    }

}

module.exports = {UBot};
