class UBotNetwork {
    constructor(logger) {
        this.logger = logger;
    }

    async shutdown() {
        this.logger.log("UBotNetwork.shutdown()...");
    }
}

module.exports = {UBotNetwork};
