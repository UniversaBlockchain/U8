/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {PublicKey} from 'crypto'
import {HttpClient} from 'web'
import {UBotSession, UBotSessionState} from 'ubot/ubot_session'

const TopologyBuilder = require("topology_builder").TopologyBuilder;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;

class UBotClientException extends Error {
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
            throw new UBotClientException("Not found URL in topology item data");

        try {
            this.key = new PublicKey(data.key);
        } catch (err) {
            throw new UBotClientException("Failed to construct node public key: " + err.message);
        }
    }

    toString() {
        return "Node(" + this.url + "," + this.key + ")";
    }
}

class UBotClient {
    constructor(clientPrivateKey, topologyInput, topologyCacheDir) {
        this.clientPrivateKey = clientPrivateKey;
        this.topologyInput = topologyInput;
        this.topologyCacheDir = topologyCacheDir;
        this.nodes = [];
        this.ubots = [];
        this.topologyUBotNet = null;
        this.httpUbotClient = null;
        this.ubotPublicKey = null;
        this.httpNodeClients = [];
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
        if (this.httpNodeClients.length === 0)
            await this.httpNodeClient.stop();
        for (let nodeClient of this.httpNodeClients)
            await nodeClient.stop();
        if (this.httpUbotClient != null)
            await this.httpUbotClient.stop();
    }

    async connectAllNodes() {
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.topology[i].number === this.httpNodeClient.nodeNumber)
                this.httpNodeClients.push(this.httpNodeClient);
            else {
                let httpClient = new HttpClient(this.nodes[i].url);
                httpClient.nodeNumber = this.topology[i].number;
                await httpClient.start(this.clientPrivateKey, this.nodes[i].key);
                this.httpNodeClients.push(httpClient);
            }
        }
    }

    async connectUbot(pool) {
        if (this.topologyUBotNet == null)
            throw new UBotClientException("UBotNet topology not initialized");

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
            throw new UBotClientException("Wrong session data");

        console.log("UBotClient.getSession: " + JSON.stringify(sessionData.session));
        return sessionData.session;
    }

    async askSession(command, params) {
        let data = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        );

        console.log("UBotClient.askSession: " + JSON.stringify(data));
        return data;
    }

    async askSessionOnAllNodes(command, params) {
        if (this.httpNodeClients.length === 0)
            await this.connectAllNodes();

        let data = await Promise.all(this.httpNodeClients.map(nodeClient => new Promise(async (resolve, reject) =>
            await nodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        )));

        console.log("UBotClient.askSessionOnAllNodes: " + JSON.stringify(data));
        return data;
    }

    async createSession(requestContract) {
        let session = await this.getSession("ubotCreateSession",
            {packedRequest: await requestContract.getPackedTransaction()});

        // wait session requestId
        while (session.state === UBotSessionState.VOTING_REQUEST_ID.val) {
            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (session == null)
            throw new UBotClientException("Session is null");

        if (session.state === UBotSessionState.ABORTED.val)
            throw new UBotClientException("Session has been aborted");

        if (session.requestId == null || !session.requestId.equals(requestContract.id))
            throw new UBotClientException("Unable to create session by request contract");

        // wait session id and pool
        while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.ABORTED.val) {
            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (session.state === UBotSessionState.ABORTED.val)
            throw new UBotClientException("Session has been aborted");

        if (session.sessionPool == null)
            throw new UBotClientException("Unable to get session pool");

        return new UBotSession(session, this, requestContract.state.data.executable_contract_id);
    }

    async startCloudMethod(requestContract) {
        if (this.httpUbotClient != null)
            throw new UBotClientException("Ubot is connected to the pool. First disconnect from the pool");

        let session = await this.createSession(requestContract);

        // get ubot registry
        let serviceContracts = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getServiceContracts", null,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (serviceContracts == null || serviceContracts.contracts == null ||
            serviceContracts.contracts.ubot_registry_contract == null)
            throw new UBotClientException("Unable to get ubot registry contract");

        let ubotRegistry = await Contract.fromSealedBinary(serviceContracts.contracts.ubot_registry_contract);
        //console.log(JSON.stringify(ubotRegistry.state.data.topology, null, 2));

        this.topologyUBotNet = ubotRegistry.state.data.topology;
        await this.connectUbot(session.pool);

        // execute cloud method
        let resp = await new Promise(async (resolve, reject) =>
            await this.httpUbotClient.command("executeCloudMethod", {contract: await requestContract.getPackedTransaction()},
                result => resolve(result),
                error => reject(error)
            )
        );

        if (resp == null || resp.status !== "ok")
            throw new UBotClientException("Error execute cloud method, response: " + JSON.stringify(resp));

        return session;
    }

    async checkSession(executableContractId, requestContractId, ubotNumber, ubot) {
        let session = await this.getSession("ubotGetSession",
            {executableContractId: executableContractId});

        if (session == null)
            throw new UBotClientException("Session is null");

        if (session.state !== UBotSessionState.OPERATIONAL.val) {
            if (session.state !== UBotSessionState.VOTING_SESSION_ID.val)
                throw new UBotClientException("Session is not in operational mode");

            // wait session id and pool
            while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.ABORTED.val) {
                await sleep(100);
                session = await this.getSession("ubotGetSession", {executableContractId: executableContractId});
            }

            if (session.state === UBotSessionState.ABORTED.val)
                throw new UBotClientException("Session has been aborted");
        }

        if (session.requestId == null || !session.requestId.equals(requestContractId))
            throw new UBotClientException("Session does not match the request contract");

        if (session.sessionPool == null)
            throw new UBotClientException("Unable to get session pool");

        if (!~session.sessionPool.indexOf(ubotNumber))
            throw new UBotClientException("Ubot is not in the pool of session");

        return new UBotSession(session, this, executableContractId, ubot);
    }

    async getStateCloudMethod(requestContractId) {
        if (this.httpUbotClient == null)
            throw new UBotClientException("Ubot HTTP client is not initialized");

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

    async disconnectUbot() {
        if (this.httpUbotClient == null)
            throw new UBotClientException("Ubot is not connected to the pool");

        await this.httpUbotClient.stop();
        this.httpUbotClient = null;
    }
}

module.exports = {UBotClient};