import * as network from "web";
const Contract = require("contract").Contract;
const HashId = require("crypto").HashId;
const Boss = require('boss.js');

class UBotHttpServer extends network.HttpServer {

    constructor(privateKey, host, port, logger, ubot) {
        super(host, port, 32, 32);
        this.logger = logger;
        this.ubot = ubot;
        super.initSecureProtocol(privateKey);

        this.addSecureEndpoint("executeCloudMethod", (params, clientKey) => this.onExecuteCloudMethod(params, clientKey));

        this.addRawEndpoint("/getStartingContract", request => this.onGetStartingContract(request));

        super.startServer();
    }

    async shutdown() {
        return this.stopServer();
    }

    async onExecuteCloudMethod(params, clientKey) {
        try {
            let contract = Contract.fromPackedTransaction(params.contract);
            this.ubot.executeCloudMethod(contract);
        } catch (e) {
            console.log("err: " + e.stack);
        }
        return {status:"ok"};
    }

    onGetStartingContract(request) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let encodedString = request.path.substring(paramIndex);
        let hashId = HashId.withBase64Digest(encodedString);
        let contract = this.ubot.getStartingContract(hashId);
        if (contract != null) {
            let contractBin = contract.getPackedTransaction();
            let selectedPool = this.ubot.getSelectedPoolNumbers(hashId);
            let answerBin = Boss.dump({contractBin: contractBin, selectedPool: selectedPool});
            request.setAnswerBody(answerBin);
        } else {
            request.setStatusCode(204);
        }
        request.sendAnswer();
    }

}

module.exports = {UBotHttpServer};
