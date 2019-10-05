/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {PublicKey, HashId} from 'crypto'
import {HttpClient} from 'web'
import {UBotSession, UBotSessionState} from 'ubot/ubot_session'

const TopologyBuilder = require("topology_builder").TopologyBuilder;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const Lock = require("lock").Lock;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const Boss = require('boss.js');

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
    constructor(clientPrivateKey, topologyInput, topologyCacheDir, logger = undefined) {
        this.clientPrivateKey = clientPrivateKey;
        this.topologyInput = topologyInput;
        this.topologyCacheDir = topologyCacheDir;
        this.logger = logger;
        this.nodes = [];
        this.ubots = [];
        this.topologyUBotNet = null;
        this.httpUbotClient = null;
        this.ubotPublicKey = null;
        this.httpNodeClients = new Map();
        this.httpUbotClients = new Map();
        this.lock = new Lock();
    }

    /**
     * The method starts immediately after the constructor.
     * Connects to the Universa network by its topology.
     *
     * @async
     * @return {Promise<UBotClient>}
     */
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

    /**
     * Complete client work and also closes all connections.
     *
     * @async
     * @return {Promise<void>}
     */
    async shutdown() {
        if (this.httpNodeClients.size === 0)
            await this.httpNodeClient.stop();
        for (let nodeClient of this.httpNodeClients.values())
            await nodeClient.stop();
        if (this.httpUbotClient != null && this.httpUbotClients.size === 0)
            await this.httpUbotClient.stop();
        await Promise.all(Array.from(this.httpUbotClients.values()).map(client => client.stop()));
        this.httpUbotClients.clear();
    }

    /**
     * Connects to all nodes of the Universa network.
     *
     * @private
     * @async
     * @return {Promise<void>}
     */
    async connectAllNodes() {
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.topology[i].number === this.httpNodeClient.nodeNumber)
                this.httpNodeClients.set(this.httpNodeClient.nodeNumber, this.httpNodeClient);
            else {
                let httpClient = new HttpClient(this.nodes[i].url);
                httpClient.nodeNumber = this.topology[i].number;
                await httpClient.start(this.clientPrivateKey, this.nodes[i].key);
                this.httpNodeClients.set(httpClient.nodeNumber, httpClient);
            }
        }
    }

    /**
     * Connects to a random UBot from the session pool.
     *
     * @private
     * @async
     * @param pool
     * @return {Promise<void>}
     */
    async connectRandomUbot(pool) {
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

        this.httpUbotClients.set(this.httpUbotClient.nodeNumber, this.httpUbotClient);
    }

    /**
     * Selects a specific UBot number to which the client connects.
     *
     * @private
     * @async
     * @param ubotNumber - UBot number.
     * @return {Promise<HttpClient>}
     */
    async connectUbot(ubotNumber) {
        if (this.topologyUBotNet == null || this.ubots.length === 0)
            throw new UBotClientException("UBotNet topology not initialized");

        if (this.topologyUBotNet[ubotNumber].number !== ubotNumber)
            this.topologyUBotNet.forEach((topologyItem, i) => {
                if (topologyItem.number === ubotNumber)
                    ubotNumber = i;
            });

        let ubot = this.ubots[ubotNumber];

        if (ubot.url.startsWith("https"))
            ubot.url = "http" + ubot.url.substring(5);

        let client = new HttpClient(ubot.url);
        client.nodeNumber = this.topologyUBotNet[ubotNumber].number;
        await client.start(this.clientPrivateKey, ubot.key);

        this.httpUbotClients.set(client.nodeNumber, client);

        return client;
    }

    /**
     * Executes the session request command on the Universa network on the node to which the client was connected,
     * in the Start method.
     *
     * @private
     * @async
     * @return {Promise<Object>} command result.
     */
    async getSession(command, params) {
        let sessionData = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        );

        if (sessionData == null || !sessionData.hasOwnProperty("session"))
            throw new UBotClientException("Wrong session data");

        let message = "UBotClient.getSession: " + JSON.stringify(sessionData.session, (key, value) => {
            if ((key === "requestId" || key === "sessionId") && value != null && value instanceof crypto.HashId)
                return value.toString();
            else
                return value;
        });
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        return sessionData.session;
    }

    /**
     * Executes a command on the Universa network on the node to which the client was connected, in {@link start}.
     *
     * @private
     * @async
     * @return {Promise<Object>} command result.
     */
    async askSession(command, params) {
        let data = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command(command, params,
                result => resolve(result),
                error => reject(error)
            )
        );

        let message = "UBotClient.askSession: " + JSON.stringify(data, (key, value) => {
            if ((key === "requestId" || key === "sessionId") && value != null && value instanceof crypto.HashId)
                return value.toString();
            else
                return value;
        });
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        return data;
    }

    /**
     * Executes a command on all nodes of the Universa network.
     *
     * @private
     * @async
     * @return {Promise<Object>} command result.
     */
    async askSessionOnAllNodes(command, params) {
        await this.lock.synchronize("connectNodes", async () => {
            if (this.httpNodeClients.size === 0)
                await this.connectAllNodes();
        });

        let data = await Promise.all(Array.from(this.httpNodeClients.values()).map(nodeClient =>
            new Promise(async (resolve, reject) =>
                await nodeClient.command(command, params,
                    result => resolve(result),
                    error => reject(error)
                )
            )
        ));

        let message = "UBotClient.askSessionOnAllNodes: " + JSON.stringify(data, (key, value) => {
            if ((key === "requestId" || key === "sessionId") && value != null && value instanceof crypto.HashId)
                return value.toString();
            else
                return value;
        });
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        return data;
    }

    /**
     * Creates a new session for the cloud method.
     *
     * @private
     * @async
     * @return {UBotSession} session.
     */
    async createSession(requestContract, waitPreviousSession = false) {
        let params = {packedRequest: await requestContract.getPackedTransaction()};
        let session = await this.getSession("ubotCreateSession", params);

        if (session == null)
            throw new UBotClientException("Session is null");

        // wait session requestId
        while (session.state === UBotSessionState.VOTING_REQUEST_ID.val) {
            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (waitPreviousSession) {
            while (session.requestId == null || !session.requestId.equals(requestContract.id)) {
                if (session.state === UBotSessionState.CLOSING.val || session.state === UBotSessionState.CLOSED.val)
                    await sleep(100);
                else
                    await sleep(1000);

                session = await this.getSession("ubotCreateSession", params);

                if (session == null)
                    throw new UBotClientException("Session is null");
            }

        } else if (session.requestId == null || !session.requestId.equals(requestContract.id))
            throw new UBotClientException("Unable to create session by request contract");

        if (session.state === UBotSessionState.CLOSING.val)
            throw new UBotClientException("Session is closing");

        if (session.state === UBotSessionState.CLOSED.val)
            throw new UBotClientException("Session has been closed");

        // wait session id and pool
        while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.CLOSING.val &&
            session.state !== UBotSessionState.CLOSED.val) {

            await sleep(100);
            session = await this.getSession("ubotGetSession",
                {executableContractId: requestContract.state.data.executable_contract_id});
        }

        if (session.state === UBotSessionState.CLOSING.val)
            throw new UBotClientException("Session is closing");

        if (session.state === UBotSessionState.CLOSED.val)
            throw new UBotClientException("Session has been closed");

        if (session.sessionPool == null)
            throw new UBotClientException("Unable to get session pool");

        return new UBotSession(session, this, requestContract.state.data.executable_contract_id);
    }

    /**
     * Check request (request and executable contracts) before create session.
     *
     * @param {Contract} requestContract - The Request contract.
     * @private
     * @throws {UBotClientException} client exception.
     */
    static checkRequest(requestContract) {
        if (requestContract == null)
            throw new UBotClientException("Request contract is null");

        if (requestContract.state.data.executable_contract_id == null)
            throw new UBotClientException("Error request contract: executable contact ID is not defined");

        if (requestContract.transactionPack == null || requestContract.transactionPack.referencedItems == null)
            throw new UBotClientException("Error request contract: executable contact is not found in transaction pack");

        // get executable contract
        let executableContract = requestContract.transactionPack.referencedItems.get(requestContract.state.data.executable_contract_id);

        if (executableContract == null)
            throw new UBotClientException("Error request contract: executable contact is not found in transaction pack");

        // check request contract data
        if (requestContract.state.data.method_name == null || typeof requestContract.state.data.method_name !== "string")
            throw new UBotClientException("Error request contract: starting cloud method name is not defined or not string");

        if (!requestContract.state.data.executable_contract_id.equals(executableContract.id))
            throw new UBotClientException("Error request contract: executable contact ID not match ID saved in request contract");

        let methodName = requestContract.state.data.method_name;

        // check executable contract data
        if (executableContract.state.data.cloud_methods == null ||
            !executableContract.state.data.cloud_methods.hasOwnProperty(methodName))
            throw new UBotClientException("Error executable contract: starting cloud method metadata (in state.data.cloud_methods) is not defined");

        if (executableContract.state.data.cloud_methods[methodName] == null ||
            typeof executableContract.state.data.cloud_methods[methodName] !== "object")
            throw new UBotClientException("Error executable contract: starting cloud method metadata (in state.data.cloud_methods) is not object");

        if (executableContract.state.data.cloud_methods[methodName].pool == null ||
            executableContract.state.data.cloud_methods[methodName].pool.size == null)
            throw new UBotClientException("Error executable contract: pool of starting cloud method is not defined in metadata (in state.data.cloud_methods)");

        if (executableContract.state.data.cloud_methods[methodName].quorum == null ||
            executableContract.state.data.cloud_methods[methodName].quorum.size == null)
            throw new UBotClientException("Error executable contract: quorum of starting cloud method is not defined in metadata (in state.data.cloud_methods)");

        if (executableContract.state.data.js == null && executableContract.state.data.cloud_methods[methodName].ubotAsm == null)
            throw new UBotClientException("Error executable contract: executable contact JS-code is not defined");
    }

    /**
     * Get quorum size of request cloud method.
     *
     * @param {Contract} requestContract - The Request contract.
     * @private
     */
    static getRequestQuorumSize(requestContract) {
        let executableContract = requestContract.transactionPack.referencedItems.get(requestContract.state.data.executable_contract_id);
        return executableContract.state.data.cloud_methods[requestContract.state.data.method_name].quorum.size;
    }

    /**
    * Start cloud method.
    * Requests the creation of a session with a randomly selected pool using the Request contract.
    * Creates a session with the id of the Request contract or throws an exception if the session is already created
    * for another Request contract under the same executable contract.
    * Waits until the session is assigned an id and a pool is calculated from it.
    * Then he asks for a contract with the registry and topology of UBots,
    * connects to a random UBots from the pool on which he runs the cloud method.
    *
    * @param {Contract} requestContract - The Request contract.
     *@param {boolean} waitPreviousSession - Wait finished previous session or return his and exit.
     *      If true - repeated attempts to start the cloud method after 1 second if the session is in OPERATIONAL mode or
     *      100 ms if the session is in CLOSING mode. By default - false.
    * @async
    * @return {UBotSession} session.
    */
    async startCloudMethod(requestContract, waitPreviousSession = false) {
        if (this.httpUbotClient != null)
            throw new UBotClientException("Ubot is connected to the pool. First disconnect from the pool");

        UBotClient.checkRequest(requestContract);

        let session = await this.createSession(requestContract, waitPreviousSession);

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

        this.topologyUBotNet = ubotRegistry.state.data.topology;
        await this.connectRandomUbot(session.pool);

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

    /**
     * Execute cloud method.
     * Start cloud method (@see startCloudMethod) and wait it finished.
     *
     * @param {Contract} requestContract - The Request contract.
     * @param {boolean} waitPreviousSession - Wait finished previous session or return his and exit.
     *      If true - repeated attempts to start the cloud method after 1 second if the session is in OPERATIONAL mode or
     *      100 ms if the session is in CLOSING mode. By default - false.
     * @async
     * @return {Promise<Object>} cloud method state gathered session pool consensus, fields in the object:
     *      state - method status,
     *      result - method result,
     *      errors - error list.
     * @throws {UBotClientException} client exception if session pool consensus is not reached.
     */
    async executeCloudMethod(requestContract, waitPreviousSession = false) {
        let session = await this.startCloudMethod(requestContract, waitPreviousSession);

        let quorum = UBotClient.getRequestQuorumSize(requestContract);

        let states = [];
        let groups = new Map();

        let state = await this.waitCloudMethod(requestContract.id);

        // check consensus
        if (quorum <= 1)
            return state;

        states.push(state);
        groups.set(HashId.of(await Boss.dump(await BossBiMapper.getInstance().serialize(state))).base64, 1);

        let finishFire = null;
        let finishEvent = new Promise(resolve => finishFire = resolve);
        let waiting = true;

        session.pool.filter(ubotNumber => ubotNumber !== this.httpUbotClient.nodeNumber).forEach(
            ubotNumber => this.waitCloudMethod(requestContract.id, ubotNumber).then(async (state) =>
                await this.lock.synchronize(requestContract.id, async () => {
                    if (!waiting)
                        return;

                    states.push(state);

                    let groupKey = HashId.of(await Boss.dump(await BossBiMapper.getInstance().serialize(state))).base64;
                    let count = groups.get(groupKey);
                    if (count == null)
                        count = 0;

                    // check consensus
                    if (count + 1 >= quorum) {
                        waiting = false;
                        finishFire(state);
                    }

                    groups.set(groupKey, count + 1);

                    // check consensus available
                    if (Array.from(groups.values()).every(c => c + session.pool.length - states.length < quorum)) {
                        waiting = false;
                        finishFire(null);
                    }
                })
            )
        );

        let result = await finishEvent;
        if (result != null)
            return result;

        let message = null;
        try {
            message = JSON.stringify(states);
        } catch (err) {
            message = "Not stringified";
        }

        throw new UBotClientException("Cloud method consensus can`t be reached, ubot states: " + message);
    }

    /**
     * Verification of the session on the id of the Executable contract and the Request contract.
     *
     * @param {HashId} executableContractId - The Executable contract id.
     * @param {HashId} requestContractId - The Request contract id.
     * @param {number} ubotNumber - UBot number to request the current state.
     * @param {UBot} ubot - UBot.
     * @private
     * @async
     * @return {Promise<UBotSession>}.
     */
    async checkSession(executableContractId, requestContractId, ubotNumber, ubot) {
        let session = await this.getSession("ubotGetSession",
            {executableContractId: executableContractId});

        if (session == null)
            throw new UBotClientException("Session is null");

        if (session.state !== UBotSessionState.OPERATIONAL.val) {
            if (session.state !== UBotSessionState.VOTING_SESSION_ID.val)
                throw new UBotClientException("Session is not in operational mode");

            // wait session id and pool
            while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.CLOSING.val &&
            session.state !== UBotSessionState.CLOSED.val) {

                await sleep(100);
                session = await this.getSession("ubotGetSession", {executableContractId: executableContractId});
            }

            if (session.state === UBotSessionState.CLOSING.val)
                throw new UBotClientException("Session is closing");

            if (session.state === UBotSessionState.CLOSED.val)
                throw new UBotClientException("Session has been closed");
        }

        if (session.requestId == null || !session.requestId.equals(requestContractId))
            throw new UBotClientException("Session does not match the request contract");

        if (session.sessionPool == null)
            throw new UBotClientException("Unable to get session pool");

        if (!~session.sessionPool.indexOf(ubotNumber))
            throw new UBotClientException("Ubot is not in the pool of session");

        return new UBotSession(session, this, executableContractId, ubot);
    }

    /**
     * Gets the current state of the cloud method, if the state is FINISHED,
     * then the result of the cloud method execution is in the returned data.
     *
     * @param {HashId} requestContractId - The Request contract id.
     * @param {number} ubotNumber - UBot number to request the current state.
     *      By default - number of ubot, which connected in {@link startCloudMethod}.
     * @async
     * @return {Promise<Object>} cloud method state, fields in the object:
     *      state - method status,
     *      result - method result,
     *      errors - error list.
     */
    async getStateCloudMethod(requestContractId, ubotNumber = undefined) {
        let client = null;
        if (ubotNumber != null) {
            client = this.httpUbotClients.get(ubotNumber);
            if (client == null)
                client = await this.connectUbot(ubotNumber);
        } else
            client = this.httpUbotClient;

        if (client == null)
            throw new UBotClientException("Ubot HTTP client is not initialized");

        return new Promise(async (resolve, reject) =>
            await client.command("getState", {requestContractId: requestContractId},
                result => resolve(result),
                error => reject(error)
            )
        );
    }

    /**
     * It waits for the completion of the cloud method and
     * returns its final state with the result of the cloud method.
     *
     * @param {HashId} requestContractId - The Request contract id.
     * @param {number} ubotNumber - UBot number to request the current state.
     *      By default - number of ubot, which connected in {@link startCloudMethod}.
     * @async
     * @return {Promise<Object>} cloud method state, fields in the object:
     *      state - method status,
     *      result - method result,
     *      errors - error list.
     */
    async waitCloudMethod(requestContractId, ubotNumber = undefined) {
        let state = await this.getStateCloudMethod(requestContractId, ubotNumber);

        // waiting pool finished...
        while (UBotPoolState.byVal.get(state.state).canContinue) {
            await sleep(100);
            state = await this.getStateCloudMethod(requestContractId, ubotNumber);
        }

        return state;
    }

    /**
     * Disconnects from random UBots from the pool selected to execute the cloud method.
     * But it remains connected to the nodes of the Universa network. This allows you to start a new cloud method
     * on a new random pool using the startCloudMethod method.
     *
     * @async
     * @return {Promise<void>}
     */
    async disconnectUbot() {
        if (this.httpUbotClient == null)
            throw new UBotClientException("Ubot is not connected to the pool");

        if (this.httpUbotClients.size === 0)
            await this.httpUbotClient.stop();
        this.httpUbotClient = null;

        await Promise.all(Array.from(this.httpUbotClients.values()).map(client => client.stop()));
        this.httpUbotClients.clear();
    }
}

module.exports = {UBotClient};