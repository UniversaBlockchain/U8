/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as network from "web";
const Contract = require("contract").Contract;
const HashId = require("crypto").HashId;
const Boss = require('boss.js');
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const UBotConfig = require("ubot/ubot_config").UBotConfig;

class UBotHttpServer extends network.HttpServer {

    constructor(privateKey, host, port, logger, ubot) {
        super(host, port, UBotConfig.http_server_pool_size);
        this.logger = logger;
        this.ubot = ubot;
        super.initSecureProtocol(privateKey);

        this.addSecureEndpoint("executeCloudMethod", (params, clientKey) => this.onExecuteCloudMethod(params, clientKey));
        this.addSecureEndpoint("getState", (params, clientKey) => this.getState(params, clientKey));

        this.addRawEndpoint("/getStartingContract", request => this.onGetStartingContract(request));
        this.addRawEndpoint("/getSingleStorageResult", request => this.onGetStorageResult(request, false));
        this.addRawEndpoint("/getMultiStorageResult", request => this.onGetStorageResult(request, true));
        this.addRawEndpoint("/downloadActualSingleStorageResult", request => this.onDownloadActualStorageResult(request, false));
        this.addRawEndpoint("/downloadActualMultiStorageResult", request => this.onDownloadActualStorageResult(request, true));

        super.startServer();
    }

    async shutdown() {
        return this.stopServer();
    }

    async onExecuteCloudMethod(params, clientKey) {
        try {
            let contract = await Contract.fromPackedTransaction(params.contract);
            this.ubot.executeCloudMethod(contract);
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("executeCloudMethod ERROR: " + err.message);

            return {errors : [new ErrorRecord(Errors.COMMAND_FAILED, "executeCloudMethod", err.message)]};
        }
        return {status:"ok"};
    }

    async getState(params, clientKey) {
      try {
          let proc = this.ubot.processors.get(params.startingContractId.base64);
          let result = {state: proc.state.val};
          if (proc.state === UBotPoolState.FINISHED)
              result.result = proc.output;
          if (proc.state === UBotPoolState.FAILED)
              result.errors = proc.errors;
          return result;

        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("getState ERROR: " + err.message);

            return {errors : [new ErrorRecord(Errors.COMMAND_FAILED, "getState", err.message)]};
        }
    }

    async onGetStartingContract(request) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let encodedString = request.path.substring(paramIndex);
        let hashId = HashId.withBase64Digest(encodedString);
        let contract = this.ubot.getStartingContract(hashId);
        if (contract != null) {
            let contractBin = await contract.getPackedTransaction();
            let selectedPool = this.ubot.getSelectedPoolNumbers(hashId);
            let answerBin = await Boss.dump({contractBin: contractBin, selectedPool: selectedPool});
            request.setAnswerBody(answerBin);
        } else {
            request.setStatusCode(204);
        }
        request.sendAnswer();
    }

    async onGetStorageResult(request, multi) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let encodedString = request.path.substring(paramIndex);
        let hash = HashId.withBase64Digest(encodedString);

        let result = await this.ubot.getStoragePackedResultByHash(hash, multi);
        if (result != null)
            request.setAnswerBody(result);
        else
            request.setStatusCode(204);

        request.sendAnswer();
    }

    async onDownloadActualStorageResult(request, multi) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let paramsString = request.path.substring(paramIndex);
        let params = paramsString.split("_");
        let recordId = HashId.withBase64Digest(params[0]);
        let actualHash = HashId.withBase64Digest(params[1]);

        let result = null;
        let resultHash = null;
        if (multi) {
            let records = await this.ubot.getRecordsFromMultiStorageByRecordId(recordId, true);
            // assume result (cortege) and calculate hash
            // TODO:... (use records.hashes)
        } else {
            result = await this.ubot.getStoragePackedResultByRecordId(recordId, false);
            resultHash = HashId.of(result);
        }

        if (result != null && resultHash != null && resultHash.equals(actualHash))
            request.setAnswerBody(result);
        else
            request.setStatusCode(204);

        request.sendAnswer();
    }
}

module.exports = {UBotHttpServer};
