/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {PublicKey} from 'crypto'
import {HttpClient} from 'web'

const TopologyBuilder = require("topology_builder").TopologyBuilder;
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
        this.clients = [];
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

        this.nodes.forEach(() => this.clients.push(null));
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

    async getSession(command, params) {
        let sessionData = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (sessionData == null || !sessionData.hasOwnProperty("session"))
            throw new UbotClientException("Wrong session data");

        //console.log(JSON.stringify(sessionData.session));
        return sessionData.session;
    }

    async startCloudMethod(requestContract) {
        let session = await this.getSession("ubotCreateSession",
            {packedRequest: await requestContract.getPackedTransaction()});

        // wait session requestId
        while (session.state === UBotSessionState.VOTING_REQUEST_ID.val) {
            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (session.state === UBotSessionState.ABORTED.val)
            throw new UbotClientException("Session has been aborted");

        if (session.requestId == null || !session.requestId.equals(requestContract.id))
            throw new UbotClientException("Unable to create session by request contract");

        // wait session id and pool
        while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.ABORTED.val) {
            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (session.state === UBotSessionState.ABORTED.val)
            throw new UbotClientException("Session has been aborted");

        if (!session.hasOwnProperty("sessionPool"))
            throw new UbotClientException("Unable to get session pool");

        let pool = session.sessionPool;

        // get ubot registry
        let serviceContracts = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getServiceContracts", null,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (serviceContracts == null || !serviceContracts.hasOwnProperty("contracts") ||
            !serviceContracts.contracts.hasOwnProperty("ubot_registry_contract"))
            throw new UbotClientException("Unable to get ubot registry contract");

        let ubotRegistry = await Contract.fromSealedBinary(serviceContracts.contracts.ubot_registry_contract);

        //console.log(JSON.stringify(ubotRegistry.state.data, null, 2));
    }
}

module.exports = {UbotClient};