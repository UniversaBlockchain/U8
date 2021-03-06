/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {HashId} from 'crypto';

const t = require("tools");
const ut = require("ubot/ubot_tools");
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const UBotClientException = require("ubot/ubot_exceptions").UBotClientException;

const UBotSessionState = {
    VOTING_REQUEST_ID       : {val: "VOTING_REQUEST_ID", ordinal: 0},
    COLLECTING_RANDOMS      : {val: "COLLECTING_RANDOMS", ordinal: 1},
    VOTING_SESSION_ID       : {val: "VOTING_SESSION_ID", ordinal: 2},
    OPERATIONAL             : {val: "OPERATIONAL", ordinal: 3},
    CLOSING                 : {val: "CLOSING", ordinal: 4},
    CLOSED                  : {val: "CLOSED", ordinal: 5}
};

t.addValAndOrdinalMaps(UBotSessionState);

class UBotSession {
    constructor(session, client, executableContractId, ubot = undefined) {
        this.client = client;
        this.state = UBotSessionState.byVal.get(session.state);
        this.pool = session.sessionPool;
        this.requestId = session.requestId;
        this.sessionId = session.sessionId;
        this.closeVotes = session.closeVotes;
        this.executableContractId = executableContractId;
        this.ubot = ubot;
        this.quantaLimit = session.quantaLimit;
        this.transactionEntranceCounter = 0;
        this.transactionFinishCounter = 0;
    }

    async updateStorage(storageName, hash, multi) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotProcess_write" + (multi ? "Multi" : "Single") + "Storage " + storageName + "... UBotSession.updateStorage hash = " + hash);

        let fullStorageName = storageName + (multi ? "_multi" : "_single");

        let answers = await this.client.askOnAllNodes("ubotUpdateStorage", {
            requestId: this.requestId,
            storageName: fullStorageName,
            //fromValue: fromValue,
            toValue: hash
        });

        // check answers
        if (answers == null || !answers instanceof Array || answers.length !== this.client.httpNodeClients.size)
            throw new UBotClientException("Error UBotSession.updateStorage " + storageName + ": askOnAllNodes must return array");

        if (this.client.httpNodeClients.size < UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length))
            throw new UBotClientException("Error UBotSession.updateStorage " + storageName + ": not enough answers for consensus");

        let failed = 0;
        let errors = [];

        for (let i = 0; i < answers.length; i++) {
            if (answers[i] == null)
                throw new UBotClientException("Error UBotSession.updateStorage " + storageName + ": ubotUpdateStorage return null");

            if (answers[i] instanceof Error) {
                failed++;
                errors.push(answers[i].toString());
                if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.topology.length))
                    throw new UBotClientException(
                        "Error UBotSession.updateStorage " + storageName + ": error in answers from some nodes - consensus was broken. Errors: " +
                        JSON.stringify(errors));
            }
        }
    }

    async getStorage(storageName, multi, trustLevel, requestContract) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.getStorage " + storageName);

        let fullStorageName = storageName + (multi ? "_multi" : "_single");
        let result = undefined;
        let first = true;
        let tryNumber = 0;

        // define the part of Universa nodes, that is required for trusted or untrusted reading from storage
        let nodes = this.client.topology.map(node => node.number);
        let trust = Math.ceil(nodes.length * trustLevel);
        if (trust > nodes.length)
            trust = nodes.length;

        let selected = t.randomChoice(nodes, trust, false);

        let maxTime = ut.getRequestMaxWaitUbot(requestContract);
        if (maxTime != null)
            maxTime += Date.now();

        do {
            let delay = Math.min(tryNumber, 50) * UBotConfig.waitPeriod;

            if (maxTime != null && Date.now() + delay > maxTime)
                throw new UBotClientException("Error UBotSession.getStorage " + storageName + ": Maximum waiting time is exceeded");

            ++tryNumber;
            if (delay > 0)
                await sleep(delay);

            let answers = await this.client.askOnSomeNodes("ubotGetStorage", {
                requestId: this.requestId,
                storageNames: [fullStorageName]
            }, selected);

            if (answers == null || !answers instanceof Array || answers.length !== selected.length)
                throw new UBotClientException("Error UBotSession.getStorage " + storageName + ": askOnSomeNodes must return array");

            let groups = new Map();
            let asked = 0;
            let failed = 0;
            let errors = [];

            for (let i = 0; i < answers.length; i++) {
                let answer = answers[i];
                if (answer == null)
                    throw new UBotClientException("Error UBotSession.getStorage " + storageName + ": ubotGetStorage return null");

                if (!(answer instanceof Error)) {
                    if (answer.current == null || answer.pending == null)
                        throw new UBotClientException("Error UBotSession.getStorage " + storageName + ": ubotGetStorage wrong result");

                    if (answer.pending[fullStorageName] == null || Object.keys(answer.pending[fullStorageName]).length === 0) {
                        asked++;

                        let hash = answer.current[fullStorageName];
                        let key = (hash != null) ? hash.base64 : "null";

                        let count = groups.get(key);
                        if (count == null)
                            count = 0;

                        // check trust level
                        if (count + 1 >= trust) {
                            result = hash;
                            break;
                        } else {
                            groups.set(key, count + 1);

                            // check trust level available
                            if (Array.from(groups.values()).every(c => c + this.client.topology.length - asked < trust))
                                throw new UBotClientException("Error UBotSession.getStorage " + storageName + ": trust level can`t be reached");
                        }
                    }
                } else {
                    asked++;
                    failed++;
                    errors.push(answers[i].toString());
                    if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.topology.length))
                        throw new UBotClientException(
                            "Error UBotSession.getStorage " + storageName + ": error in answers from some nodes - consensus was broken. Errors: " +
                            JSON.stringify(errors));
                }
            }

            if (result === undefined && first) {
                selected.push(...nodes);
                first = false;
            }

        } while (result === undefined);

        return result;
    }

    async registerContract(packed, contractIdsForPoolSign, requestContract) {
        let contract = await Contract.fromPackedTransaction(packed);

        if (this.ubot != null)
            this.ubot.logger.log("registerContract... Contract.id = " + contract.id);

        // if (initiateLongVote)
        //     await this.client.askSessionOnAllNodes("initiateVote", {packedItem: contract.sealedBinary});
        if (contractIdsForPoolSign == null || !contractIdsForPoolSign instanceof Array || contractIdsForPoolSign.length === 0)
            await this.client.askOnAllNodes("addKeyToContract", {itemId: contract.id});
        else for (let contractId of contractIdsForPoolSign)
            await this.client.askOnAllNodes("addKeyToContract", {itemId: HashId.withBase64Digest(contractId)});

        let quorum = 0;
        if (this.ubot != null)      // UBot session
            quorum = ut.getRequestPoolAndQuorum(requestContract, this.ubot.network.netConfig.size).quorum;
        else                        // UBotClient session (without UBot)
            quorum = this.client.poolAndQuorum.quorum;

        let maxWaitUbot = ut.getRequestMaxWaitUbot(requestContract);

        // wait quorum votes
        let positive = UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length);
        let votes = null;
        let tryNumber = 0;
        let maxTime = null;
        if (maxWaitUbot != null)
            maxTime = Date.now() + maxWaitUbot;

        do {
            let delay = Math.min(tryNumber, 50) * UBotConfig.waitPeriod;

            if (maxTime != null && Date.now() + delay > maxTime)
                throw new UBotClientException("Error UBotSession.registerContract: Maximum waiting time for votes on the registered contract is exceeded");

            ++tryNumber;
            if (delay > 0)
                await sleep(delay);

            votes = await this.client.askOnAllNodes("getContractKeys", {itemId: contract.id});

            if (votes == null || !votes instanceof Array)
                throw new UBotClientException("Error UBotSession.registerContract: Wrong getContractKeys result");

            for (let vote of votes)
                if (vote == null || vote.keys == null || !vote.keys instanceof Array)
                    throw new UBotClientException("Error UBotSession.registerContract: Wrong getContractKeys result from node");
        } while (votes.filter(vote => vote.keys.length >= quorum).length < positive);

        if (maxWaitUbot == null)
            maxWaitUbot = 0;

        // register contract
        let ir = await this.client.ubotRegister(packed, this.sessionId, maxWaitUbot);
        if (maxWaitUbot > 0 && ir.state.isPending)
            throw new UBotClientException("Error UBotSession.registerContract: Maximum waiting time for contract registration is exceeded");

        return ir;
    }

    /**
     * Start named transaction.
     *
     * @param {string} name - Transaction name.
     * @param {number} waitMillis - Waiting transaction time in milliseconds. 0 - indefinitely.
     * @return {Promise<boolean>} true if started.
     */
    async startTransaction(name, waitMillis) {
        let maxTime = null;
        let delay = UBotConfig.waitPeriod;
        let tryNumber = 1;
        if (waitMillis !== 0)
            maxTime = Date.now() + waitMillis;

        let maxFullNetworkTime = Date.now() + UBotConfig.waitNodeForTransaction;

        do {
            let answers = await this.client.askOnAllNodes("ubotStartTransaction", {
                requestId: this.requestId,
                transactionName: name,
                transactionNumber: this.transactionEntranceCounter
            });

            if (answers == null || !answers instanceof Array)
                throw new UBotClientException("Error UBotSession.startTransaction: Wrong ubotStartTransaction results");

            let accepted = 0;
            let failed = 0;
            let errors = new Set();
            for (let answer of answers) {
                if (answer == null)
                    throw new UBotClientException("Error UBotSession.startTransaction: Wrong ubotStartTransaction result from node");

                if (answer.current != null && answer.current.equals(this.requestId))
                    accepted++;
                else if (answer.errorRecord != null && answer.message != null) {
                    failed++;
                    errors.add(answer.message);
                }
            }

            if (accepted === this.client.nodes.length || (Date.now() > maxFullNetworkTime &&
                accepted >= UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length))) {
                this.transactionEntranceCounter++;
                return true;
            } else if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.nodes.length))
                throw new UBotClientException("Error UBotSession.startTransaction, command errors: " +
                    t.secureStringify(Array.from(errors)));

            delay = Math.min(tryNumber, 20) * UBotConfig.waitPeriod;

            if (maxTime != null && Date.now() + delay > maxTime)
                return false;

            ++tryNumber;
            await sleep(delay);
        } while (maxTime == null || Date.now() < maxTime);

        return false;
    }

    /**
     * End named transaction.
     *
     * @param {string} name - Transaction name.
     * @param {number} waitMillis - Waiting transaction time in milliseconds. 0 - indefinitely.
     * @return {Promise<boolean>} true if finished successful.
     */
    async finishTransaction(name, waitMillis) {
        let maxTime = null;
        let delay = UBotConfig.waitPeriod;
        let tryNumber = 1;
        if (waitMillis !== 0)
            maxTime = Date.now() + waitMillis;

        let maxFullNetworkTime = Date.now() + UBotConfig.waitNodeForTransaction;

        do {
            let answers = await this.client.askOnAllNodes("ubotFinishTransaction", {
                requestId: this.requestId,
                transactionName: name,
                transactionNumber: this.transactionFinishCounter
            });

            if (answers == null || !answers instanceof Array)
                throw new UBotClientException("Error UBotSession.finishTransaction: Wrong ubotFinishTransaction results");

            let accepted = 0;
            let failed = 0;
            let errors = new Set();
            for (let answer of answers) {
                if (answer == null)
                    throw new UBotClientException("Error UBotSession.finishTransaction: Wrong ubotFinishTransaction result from node");

                if (answer.current == null || !answer.current.equals(this.requestId))
                    accepted++;
                else if (answer.errorRecord != null && answer.message != null) {
                    failed++;
                    errors.add(answer.message);
                }
            }

            if (accepted === this.client.nodes.length || (Date.now() > maxFullNetworkTime &&
                accepted >= UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length))) {
                this.transactionFinishCounter++;
                return true;
            } else if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.nodes.length))
                throw new UBotClientException("Error UBotSession.finishTransaction, command errors: " +
                    t.secureStringify(Array.from(errors)));

            delay = Math.min(tryNumber, 20) * UBotConfig.waitPeriod;

            if (maxTime != null && Date.now() + delay > maxTime)
                return false;

            ++tryNumber;
            await sleep(delay);
        } while (maxTime == null || Date.now() < maxTime);

        return false;
    }

    async close(finished, quantasLeft) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.close finished = " + finished + " quantasLeft = " + quantasLeft);

        await this.client.askOnAllNodes("ubotCloseSession", {
            requestId: this.requestId,
            finished: finished,
            remain: quantasLeft
        });
    }

    toString() {
        return "{sessionId: " + this.sessionId +
            ", requestId: " + this.requestId +
            ", executableContractId: " + this.executableContractId +
            ", closeVotes: " + JSON.stringify(this.closeVotes) +
            ", pool: " + JSON.stringify(this.pool) +
            ", state: " + this.state.val + "}";
    }
}

module.exports = {UBotSession, UBotSessionState};