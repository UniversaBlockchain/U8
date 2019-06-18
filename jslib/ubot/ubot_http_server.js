import * as network from "web";
const Contract = require("contract").Contract;

class UBotHttpServer extends network.HttpServer {

    constructor(privateKey, host, port, logger, ubot) {
        super(host, port, 32, 32);
        this.logger = logger;
        this.ubot = ubot;
        super.initSecureProtocol(privateKey);

        this.addSecureEndpoint("executeCloudMethod", (params, clientKey) => this.executeCloudMethod(params, clientKey));

        super.startServer();
    }

    async shutdown() {
        return this.stopServer();
    }

    async executeCloudMethod(params, clientKey) {
        try {
            let contract = Contract.fromPackedTransaction(params.contract);
            this.ubot.executeCloudMethod(contract);
        } catch (e) {
            console.log("err: " + e.stack);
        }
        return {status:"ok"};
    }

}

module.exports = {UBotHttpServer};
