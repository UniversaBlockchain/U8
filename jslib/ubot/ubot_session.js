/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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
    }

    async updateStorage(hash, multi) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotProcess_write" + (multi ? "Multi" : "Single") + "Storage... UBotSession.updateStorage hash = " + hash);

        let storageName = multi ? "default_multi" : "default_single";
        // let fromValue = null;
        //
        // if (this.ubot != null) {
        //     let storages = this.ubot.sessionStorageCache.get(this.executableContractId);
        //     if (storages != null)
        //         fromValue = storages[storageName];
        // }

        let answers = await this.client.askOnAllNodes("ubotUpdateStorage", {
            requestId: this.requestId,
            storageName: storageName,
            //fromValue: fromValue,
            toValue: hash
        });

        // check answers
        if (answers == null || !answers instanceof Array || answers.length !== this.client.httpNodeClients.size)
            throw new UBotClientException("Error UBotSession.updateStorage: askOnAllNodes must return array");

        if (this.client.httpNodeClients.size < UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length))
            throw new UBotClientException("Error UBotSession.updateStorage: not enough answers for consensus");

        let failed = 0;
        let errors = [];

        for (let i = 0; i < answers.length; i++) {
            if (answers[i] == null)
                throw new Error("ubotUpdateStorage return null");

            if (answers[i] instanceof Error) {
                failed++;
                errors.push(answers[i].toString());
                if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.topology.length))
                    throw new UBotClientException(
                        "Error UBotSession.updateStorage: error in answers from some nodes - consensus was broken. Errors: " +
                        JSON.stringify(errors));
            }
        }

        // if (this.ubot != null) {
        //     let storages = this.ubot.sessionStorageCache.get(this.executableContractId);
        //     if (storages == null)
        //         storages = {};
        //
        //     storages[storageName] = hash;
        //     this.ubot.sessionStorageCache.put(this.executableContractId, storages);
        // }
    }

    async getStorage(multi, trustLevel, requestContract) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.getStorage");

        let storageName = multi ? "default_multi" : "default_single";
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
                throw new UBotClientException("Error UBotSession.getStorage: Maximum waiting time is exceeded");

            ++tryNumber;
            if (delay > 0)
                await sleep(delay);

            let answers = await this.client.askOnSomeNodes("ubotGetStorage", {
                requestId: this.requestId,
                storageNames: [storageName]
            }, selected);

            if (answers == null || !answers instanceof Array || answers.length !== selected.length)
                throw new UBotClientException("Error UBotSession.getStorage: askOnSomeNodes must return array");

            let groups = new Map();
            let asked = 0;
            let failed = 0;
            let errors = [];

            for (let i = 0; i < answers.length; i++) {
                let answer = answers[i];
                if (answer == null)
                    throw new UBotClientException("Error UBotSession.getStorage: ubotGetStorage return null");

                if (!(answer instanceof Error)) {
                    if (answer.current == null || answer.pending == null)
                        throw new UBotClientException("Error UBotSession.getStorage: ubotGetStorage wrong result");

                    if (answer.pending[storageName] == null || Object.keys(answer.pending[storageName]).length === 0) {
                        asked++;

                        let hash = answer.current[storageName];
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
                                throw new UBotClientException("Error UBotSession.getStorage: trust level can`t be reached");
                        }
                    }
                } else {
                    asked++;
                    failed++;
                    errors.push(answers[i].toString());
                    if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.topology.length))
                        throw new UBotClientException(
                            "Error UBotSession.getStorage: error in answers from some nodes - consensus was broken. Errors: " +
                            JSON.stringify(errors));
                }
            }

            if (result === undefined && first) {
                selected.push(...nodes);
                first = false;
            }

        } while (result === undefined);

        // if (this.ubot != null) {
        //     let storages = this.ubot.sessionStorageCache.get(this.executableContractId);
        //     if (storages == null)
        //         storages = {};
        //
        //     storages[storageName] = result;
        //     this.ubot.sessionStorageCache.put(this.executableContractId, storages);
        // }

        return result;
    }

    async registerContract(packed, requestContract) {
        let contract = await Contract.fromPackedTransaction(packed);

        if (this.ubot != null)
            this.ubot.logger.log("registerContract... Contract.id = " + contract.id);

        // if (initiateLongVote)
        //     await this.client.askSessionOnAllNodes("initiateVote", {packedItem: contract.sealedBinary});
        await this.client.askOnAllNodes("addKeyToContract", {itemId: contract.id});

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
                transactionName: name
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
                accepted >= UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length)))
                return true;
            else if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.nodes.length))
                throw new UBotClientException("Error UBotSession.startTransaction, command errors: " +
                    t.secureStringify(Array.from(errors)));

            if (maxTime == null)
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
                transactionName: name
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
                accepted >= UBotConfig.getNetworkPositiveConsensus(this.client.nodes.length)))
                return true;
            else if (failed >= UBotConfig.getNetworkNegativeConsensus(this.client.nodes.length))
                throw new UBotClientException("Error UBotSession.finishTransaction, command errors: " +
                    t.secureStringify(Array.from(errors)));

            if (maxTime == null)
                delay = Math.min(tryNumber, 20) * UBotConfig.waitPeriod;

            if (maxTime != null && Date.now() + delay > maxTime)
                return false;

            ++tryNumber;
            await sleep(delay);
        } while (maxTime == null || Date.now() < maxTime);

        return false;
    }

    async close(finished) {
        if (this.ubot != null)
            this.ubot.logger.log("UBotSession.close finished = " + finished);

        await this.client.askOnAllNodes("ubotCloseSession", {
            requestId: this.requestId,
            finished: finished
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