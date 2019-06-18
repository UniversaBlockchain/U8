import * as network from "web";
const Contract = require("contract").Contract;

class UBotHttpServer extends network.HttpServer {

    constructor(privateKey, host, port, logger) {
        super(host, port, 32, 32);
        this.logger = logger;
        super.initSecureProtocol(privateKey);

        this.addSecureEndpoint("execJS", (params, clientKey) => this.execJS(params, clientKey));

        super.startServer();
    }

    async shutdown() {
        //this.logger.log("UBotHttpServer.shutdown()...");
        return this.stopServer();
    }

    async execJS(params, clientKey) {
        this.logger.log("UBotHttpServer.execJS()...");
        try {
            let contract = Contract.fromPackedTransaction(params.contract);
            this.logger.log("  contract.state.data: " + JSON.stringify(contract.state.data));
        } catch (e) {
            console.log("err: " + e.stack);
        }
        return {status:"ok"};
    }

}

module.exports = {UBotHttpServer};
