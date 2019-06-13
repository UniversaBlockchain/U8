class UBot {
    constructor(logger) {
        this.logger = logger;
    }

    async shutdown() {
        this.logger.log("UBot.shutdown()...");
    }
}

module.exports = {UBot};
