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
const UBotStorageType = require("ubot/ubot_ledger").UBotStorageType;

class UBotHttpServer extends network.HttpServer {

    constructor(privateKey, host, port, logger, ubot) {
        super(host, port, UBotConfig.http_server_pool_size);
        this.logger = logger;
        this.ubot = ubot;
        super.initSecureProtocol(privateKey);

        this.addSecureEndpoint("executeCloudMethod", (params, clientKey) => this.onExecuteCloudMethod(params, clientKey));
        this.addSecureEndpoint("getState", (params, clientKey) => this.getState(params, clientKey));
        this.addSecureEndpoint("pingUBot", (params, clientKey) => this.pingUBot(params, clientKey));
        this.addSecureEndpoint("getStorage", (params, clientKey) => this.getStorage(params, clientKey));

        this.addRawEndpoint("/getRequestContract", request => this.onGetRequestContract(request));
        this.addRawEndpoint("/getSingleStorageResult", request => this.onGetStorageResult(request, false));
        this.addRawEndpoint("/getMultiStorageResult", request => this.onGetStorageResult(request, true));
        this.addRawEndpoint("/downloadActualSingleStorageResult", request => this.onDownloadActualStorageResult(request, UBotStorageType.SINGLE));
        this.addRawEndpoint("/downloadActualMultiStorageResult", request => this.onDownloadActualStorageResult(request, UBotStorageType.MULTI));
        this.addRawEndpoint("/ping", request => this.onPing(request));

        super.startServer();
    }

    async shutdown() {
        return this.stopServer();
    }

    async onExecuteCloudMethod(params, clientKey) {
        try {
            let contract = await Contract.fromPackedTransaction(params.contract);
            await this.ubot.executeCloudMethod(contract);
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("executeCloudMethod ERROR: " + err.message);

            return {errors : [new ErrorRecord(Errors.COMMAND_FAILED, "executeCloudMethod", err.message)]};
        }
        return {status:"ok"};
    }

    async getState(params, clientKey) {
      try {
          let proc = this.ubot.processors.get(params.requestContractId.base64);
          if (proc == null)
              return {};

          let result = {state: proc.state.val};
          if (params.hasOwnProperty("getQuanta") && params.getQuanta)
              result.quanta = proc.quantiser.quantaSum_;
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

    async pingUBot(params, clientKey) {
        try {
            return await this.ubot.network.pingUbot(params.ubotNumber, params.timeoutMillis);
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("getState ERROR: " + err.message);

            return {errors : [new ErrorRecord(Errors.COMMAND_FAILED, "getState", err.message)]};
        }
    }

    async getStorage(params, clientKey) {
        try {
            return await this.ubot.getStorages(params.executableContractId, params.storageNames);
        } catch (err) {
            this.logger.log(err.stack);
            this.logger.log("getStorage ERROR: " + err.message);

            return {errors : [new ErrorRecord(Errors.COMMAND_FAILED, "getStorage", err.message)]};
        }
    }

    async onGetRequestContract(request) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let encodedString = request.path.substring(paramIndex);
        let hashId = HashId.withBase64Digest(encodedString);
        let contract = this.ubot.getRequestContract(hashId);
        if (contract != null) {
            let contractBin = await contract.getPackedTransaction();
            //let selectedPool = this.ubot.getSelectedPoolNumbers(hashId);
            let answerBin = await Boss.dump({contractBin: contractBin});
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

    async onDownloadActualStorageResult(request, type) {
        let paramIndex = request.path.indexOf("/", 1) + 1;
        let paramsString = request.path.substring(paramIndex);
        let params = paramsString.split("_");
        let recordId = HashId.withBase64Digest(params[0]);
        let actualHash = HashId.withBase64Digest(params[1]);

        let result = null;
        let resultHash = null;
        if (type === UBotStorageType.MULTI) {
            let storageResults = await this.ubot.getRecordsFromMultiStorageByRecordId(recordId, true);
            if (storageResults != null) {
                resultHash = storageResults.cortegeId;

                // assume result (cortege)
                result = [];
                storageResults.records.forEach((record, i) => result.push({
                    ubot_number: storageResults.ubots[i],
                    result: record
                }));

                result = await Boss.dump(result);
            }
        } else if (type === UBotStorageType.SINGLE) {
            result = await this.ubot.getStoragePackedResultByRecordId(recordId, type);
            if (result != null)
                resultHash = HashId.of(result);
        }

        if (result != null && resultHash != null && resultHash.equals(actualHash))
            request.setAnswerBody(result);
        else
            request.setStatusCode(204);

        request.sendAnswer();
    }

    async onPing(request) {
        request.setAnswerBody(request.requestBody);
        request.sendAnswer();
    }
}

module.exports = {UBotHttpServer};
