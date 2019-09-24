/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {PublicKey} from 'crypto'
import {HttpClient} from 'web'

const TopologyBuilder = require("topology_builder").TopologyBuilder;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const Boss = require("boss");

const UBotSessionState = {
    VOTING_REQUEST_ID       : {val: "VOTING_REQUEST_ID", ordinal: 0},
    COLLECTING_RANDOMS      : {val: "COLLECTING_RANDOMS", ordinal: 1},
    VOTING_SESSION_ID       : {val: "VOTING_SESSION_ID", ordinal: 2},
    OPERATIONAL             : {val: "OPERATIONAL", ordinal: 3},
    ABORTED                 : {val: "ABORTED", ordinal: 4}
};

class UbotClientException extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class NodeRecord {
    constructor(data) {
        if (data.hasOwnProperty("direct_urls") && data.direct_urls instanceof Array)
            this.url = data.direct_urls[0];
        else if (data.hasOwnProperty("url") && typeof data.url === "string")
            this.url = data.url;
        else
            throw new UbotClientException("Not found URL in topology item data");

        try {
            this.key = new PublicKey(data.key);
        } catch (err) {
            throw new UbotClientException("Failed to construct node public key: " + err.message);
        }
    }

    toString() {
        return "Node(" + this.url + "," + this.key + ")";
    }
}

class UbotClient {
    constructor(clientPrivateKey, topologyInput, topologyCacheDir) {
        this.clientPrivateKey = clientPrivateKey;
        this.topologyInput = topologyInput;
        this.topologyCacheDir = topologyCacheDir;
        this.nodes = [];
        this.ubots = [];
        this.topologyUBotNet = null;
        this.httpUbotClient = null;
        this.ubotPublicKey = null;
        this.session = null;
    }

    async start() {
        let tb = await new TopologyBuilder().build(this.topologyInput, this.topologyCacheDir);
        this.topology = tb.topology;
        this.version = tb.version;

        this.topology.forEach(topologyItem => {
            let keyString = topologyItem.key;
            topologyItem.key = atob(topologyItem.key.replace(/\s/g, ""));
            this.nodes.push(new NodeRecord(topologyItem));
            topologyItem.key = keyString;
        });

        let random = Math.floor(Math.random() * this.topology.length);
        let randomNode = this.nodes[random];

        this.httpNodeClient = new HttpClient(randomNode.url);
        this.httpNodeClient.nodeNumber = this.topology[random].number;
        this.nodePublicKey = randomNode.key;
        await this.httpNodeClient.start(this.clientPrivateKey, this.nodePublicKey);

        return this;
    }

    async shutdown() {
        await this.httpNodeClient.stop();
    }

    async connectUbot(pool) {
        if (this.topologyUBotNet == null)
            throw new UbotClientException("UBotNet topology not initialized");

        this.topologyUBotNet.forEach(topologyItem => {
            let keyString = topologyItem.key;
            topologyItem.key = atob(topologyItem.key.replace(/\s/g, ""));
            this.ubots.push(new NodeRecord(topologyItem));
            topologyItem.key = keyString;
        });

        let random = pool[Math.floor(Math.random() * pool.length)];

        if (this.topologyUBotNet[random].number !== random)
            this.topologyUBotNet.forEach((topologyItem, i) => {
                if (topologyItem.number === random)
                    random = i;
            });

        let randomUbot = this.ubots[random];

        if (randomUbot.url.startsWith("https"))
            randomUbot.url = "http" + randomUbot.url.substring(5);

        this.httpUbotClient = new HttpClient(randomUbot.url);
        this.httpUbotClient.nodeNumber = this.topologyUBotNet[random].number;
        this.ubotPublicKey = randomUbot.key;
        await this.httpUbotClient.start(this.clientPrivateKey, this.ubotPublicKey);
    }

    async getSession(command, params) {
        let sessionData = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (sessionData == null || !sessionData.hasOwnProperty("session"))
            throw new UbotClientException("Wrong session data");

        console.log("UbotClient.getSession: " + JSON.stringify(sessionData.session));
        return sessionData.session;
    }

    async createSession(requestContract) {
        this.session = await this.getSession("ubotCreateSession",
            {packedRequest: await requestContract.getPackedTransaction()});

        // wait session requestId
        while (this.session.state === UBotSessionState.VOTING_REQUEST_ID.val) {
            await sleep(100);
            this.session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (this.session == null)
            throw new UbotClientException("Session is null");

        if (this.session.state === UBotSessionState.ABORTED.val)
            throw new UbotClientException("Session has been aborted");

        if (this.session.requestId == null || !this.session.requestId.equals(requestContract.id))
            throw new UbotClientException("Unable to create session by request contract");

        // wait session id and pool
        while (this.session.state !== UBotSessionState.OPERATIONAL.val && this.session.state !== UBotSessionState.ABORTED.val) {
            await sleep(100);
            this.session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (this.session.state === UBotSessionState.ABORTED.val)
            throw new UbotClientException("Session has been aborted");

        if (this.session.sessionPool == null)
            throw new UbotClientException("Unable to get session pool");
    }

    async startCloudMethod(requestContract) {
        await this.createSession(requestContract);

        // get ubot registry
        let serviceContracts = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getServiceContracts", null,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (serviceContracts == null || serviceContracts.contracts == null ||
            serviceContracts.contracts.ubot_registry_contract == null)
            throw new UbotClientException("Unable to get ubot registry contract");

        let ubotRegistry = await Contract.fromSealedBinary(serviceContracts.contracts.ubot_registry_contract);
        //console.log(JSON.stringify(ubotRegistry.state.data.topology, null, 2));

        this.topologyUBotNet = ubotRegistry.state.data.topology;
        await this.connectUbot(this.session.sessionPool);

        // execute cloud method
        let resp = await new Promise(async (resolve, reject) =>
            await this.httpUbotClient.command("executeCloudMethod", {contract: await requestContract.getPackedTransaction()},
                result => resolve(result),
                error => reject(error)
            )
        );

        if (resp == null || resp.status !== "ok")
            throw new UbotClientException("Error execute cloud method, response: " + JSON.stringify(resp));
    }

    async checkSession(executableContractId, requestContractId, ubotNumber) {
        this.session = await this.getSession("ubotGetSession",
            {executableContractId: executableContractId});

        if (this.session == null)
            throw new UbotClientException("Session is null");

        if (this.session.state !== UBotSessionState.OPERATIONAL.val) {
            if (this.session.state !== UBotSessionState.VOTING_SESSION_ID.val)
                throw new UbotClientException("Session is not in operational mode");

            // wait session id and pool
            while (this.session.state !== UBotSessionState.OPERATIONAL.val && this.session.state !== UBotSessionState.ABORTED.val) {
                await sleep(100);
                this.session = await this.getSession("ubotGetSession",
                    {executableContractId: executableContractId});
            }

            if (this.session.state === UBotSessionState.ABORTED.val)
                throw new UbotClientException("Session has been aborted");
        }

        if (this.session.requestId == null || !this.session.requestId.equals(requestContractId))
            throw new UbotClientException("Session does not match the request contract");

        if (this.session.sessionPool == null)
            throw new UbotClientException("Unable to get session pool");

        if (!~this.session.sessionPool.indexOf(ubotNumber))
            throw new UbotClientException("Ubot is not in the pool of session");
    }

    async getStateCloudMethod(requestContractId) {
        if (this.httpUbotClient == null)
            throw new UbotClientException("Ubot HTTP client is not initialized");

        return new Promise(async (resolve, reject) =>
            await this.httpUbotClient.command("getState", {startingContractId: requestContractId},
                result => resolve(result),
                error => reject(error)
            )
        );
    }

    async waitCloudMethod(requestContractId) {
        let state = await this.getStateCloudMethod(requestContractId);

        // waiting pool finished...
        while (UBotPoolState.byVal.get(state.state).canContinue) {
            await sleep(100);
            state = await this.getStateCloudMethod(requestContractId);
        }

        return state;
    }
}

module.exports = {UbotClient};