class UBotLedger {
    constructor(logger) {
        this.logger = logger;
    }

    async close() {
        this.logger.log("UBotLedger.close()...");
    }
}

module.exports = {UBotLedger};
