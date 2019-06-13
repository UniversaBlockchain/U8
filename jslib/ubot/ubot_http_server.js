import * as network from "web";

class UBotHttpServer extends network.HttpServer {
    constructor(privateKey, host, port, logger) {
        super(host, port, 32, 32);
        this.logger = logger;
        super.initSecureProtocol(privateKey);
        super.startServer();
    }

    async shutdown() {
        this.logger.log("UBotHttpServer.shutdown()...");
        return this.stopServer();
    }
}

module.exports = {UBotHttpServer};
