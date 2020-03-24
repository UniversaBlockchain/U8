/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {PublicKey, HashId} from 'crypto'
import {HttpClient} from 'web'
import {UBotSession, UBotSessionState} from 'ubot/ubot_session'

const TopologyBuilder = require("topology_builder").TopologyBuilder;
const UBotPoolState = require("ubot/ubot_pool_state").UBotPoolState;
const UBotConfig = require("ubot/ubot_config").UBotConfig;
const UBotClientException = require("ubot/ubot_exceptions").UBotClientException;
const ItemResult = require('itemresult').ItemResult;
const ItemState = require('itemstate').ItemState;
const Lock = require("lock").Lock;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const Boss = require('boss.js');
const roles = require('roles');
const constr = require('constraint');
const t = require("tools");
const ut = require("ubot/ubot_tools");
const Parcel = require("parcel").Parcel;
const ParcelProcessingState = require("parcelprocessor").ParcelProcessingState;

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
    constructor(clientPrivateKey, topologyInput, topologyCacheDir = null, millisToWaitSession = null, logger = undefined) {
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
        //this.closingRequests = new Set();
        this.lock = new Lock();
        this.ubotRegistryContract = null;
        this.poolAndQuorum = null;
        this.waitSession = millisToWaitSession;
    }

    /**
     * The method starts immediately after the constructor.
     * Connects to the Universa network by its topology.
     *
     * @async
     * @return {Promise<UBotClient>}.
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
        let randoms = new Set();
        randoms.add(random);
        let attempts = Math.min(3, this.topology.length);

        while (true) {
            try {
                let randomNode = this.nodes[random];

                this.httpNodeClient = new HttpClient(randomNode.url);
                this.httpNodeClient.nodeNumber = this.topology[random].number;
                this.nodePublicKey = randomNode.key;
                await this.httpNodeClient.start(this.clientPrivateKey, this.nodePublicKey);
                break;

            } catch (err) {
                let message = "Failed connection to node " + this.topology[random].number + ". Error: " + err.message;
                if (this.logger != null)
                    this.logger.log(message);
                else
                    console.log(message);

                if (randoms.size >= attempts)
                    break;

                do {
                    random = Math.floor(Math.random() * this.topology.length);
                } while (randoms.has(random));

                randoms.add(random);
            }
        }

        return this;
    }

    /**
     * Complete client work and also closes all connections.
     *
     * @async
     * @return {Promise<void>}.
     */
    async shutdown() {
        // wait closing requests
        // while (this.closingRequests.size > 0)
        //     await sleep(UBotConfig.waitPeriod);

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
     * @async
     * @return {Promise<void>}.
     */
    async connectAllNodes() {
        for (let i = 0; i < this.nodes.length; i++)
            if (!this.httpNodeClients.has(this.topology[i].number)) {
                if (this.topology[i].number === this.httpNodeClient.nodeNumber)
                    this.httpNodeClients.set(this.httpNodeClient.nodeNumber, this.httpNodeClient);
                else {
                    let connectAttempts = 3;
                    while (connectAttempts > 0) {
                        try {
                            let httpClient = new HttpClient(this.nodes[i].url);
                            httpClient.nodeNumber = this.topology[i].number;
                            await httpClient.start(this.clientPrivateKey, this.nodes[i].key);
                            this.httpNodeClients.set(httpClient.nodeNumber, httpClient);
                            break;

                        } catch (err) {
                            let message = "Failed connection to node " + this.topology[i].number + ". Error: " + err.message;
                            if (this.logger != null)
                                this.logger.log(message);
                            else
                                console.log(message);
                        }

                        await sleep(UBotConfig.waitPeriod);
                        connectAttempts--;
                    }
                }
            }
    }

    replaceURL(URL) {
        return URL;
    }

    async initTopology(ubotRegistry) {
        this.topologyUBotNet = ubotRegistry.state.data.topology;

        this.topologyUBotNet.forEach(topologyItem => {
            let keyString = topologyItem.key;
            topologyItem.key = atob(topologyItem.key.replace(/\s/g, ""));
            this.ubots.push(new NodeRecord(topologyItem));
            topologyItem.key = keyString;
        });
    }

    /**
     * Connects to a random UBot from the session pool.
     *
     * @private
     * @async
     * @param pool - Session pool.
     * @return {Promise<void>}.
     */
    async connectRandomUbot(pool) {
        if (this.topologyUBotNet == null || this.ubots.length === 0)
            throw new UBotClientException("UBotNet topology not initialized");

        let random = pool[Math.floor(Math.random() * pool.length)];

        this.topologyUBotNet.forEach((topologyItem, i) => {
            if (topologyItem.number === random)
                random = i;
        });

        let randomUbot = this.ubots[random];

        this.httpUbotClient = new HttpClient(this.replaceURL(randomUbot.url));
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
     * @return {Promise<HttpClient>}.
     */
    async connectUbot(ubotNumber) {
        if (this.topologyUBotNet == null || this.ubots.length === 0)
            throw new UBotClientException("UBotNet topology not initialized");

        this.topologyUBotNet.forEach((topologyItem, i) => {
            if (topologyItem.number === ubotNumber)
                ubotNumber = i;
        });

        let ubot = this.ubots[ubotNumber];

        let client = new HttpClient(this.replaceURL(ubot.url));
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
     * @param {String} command - Name of the command.
     * @param {Object} params - Parameters of the command.
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

        let message = "Client.getSession: " + JSON.stringify(sessionData.session, (key, value) => {
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
     * @param {String} command - Name of the command.
     * @param {Object} params - Parameters of the command.
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

        let message = "Client.askSession: cmd=" + command + " " + JSON.stringify(data, (key, value) => {
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
     * @param {String} command - Name of the command.
     * @param {Object} params - Parameters of the command.
     * @async
     * @return {Promise<Object>} command result.
     */
    async askOnAllNodes(command, params) {
        await this.lock.synchronize("connectNodes", async () => {
            if (this.httpNodeClients.size !== this.nodes.length)
                await this.connectAllNodes();
        });

        let data = await Promise.all(Array.from(this.httpNodeClients.values()).map(nodeClient =>
            new Promise(async (resolve) =>
                await nodeClient.command(command, params,
                    result => resolve(result),
                    error => resolve(error)
                )
            )
        ));

        let message = "Client.askOnAllNodes: cmd=" + command + " " + JSON.stringify(data, (key, value) => {
            if (value != null && value instanceof crypto.HashId)
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
     * Executes a command on some nodes of the Universa network.
     *
     * @private
     * @param {String} command - Name of the command.
     * @param {Object} params - Parameters of the command.
     * @param {Array<number>} nodes - Array containing the numbers of the asked nodes.
     * @async
     * @return {Promise<Object>} command result.
     */
    async askOnSomeNodes(command, params, nodes) {
        await this.lock.synchronize("connectNodes", async () => {
            if (this.httpNodeClients.size !== this.nodes.length)
                await this.connectAllNodes();
        });

        let data = await Promise.all(nodes
            .map(nodeNumber => this.httpNodeClients.get(nodeNumber)).map(nodeClient =>
            new Promise(async (resolve) => {
                if (nodeClient == null)
                    resolve(new Error("Node is not connected"));
                else
                    await nodeClient.command(command, params,
                        result => resolve(result),
                        error => resolve(error)
                    )
            })
        ));

        let message = "Client.askOnSomeNodes: cmd=" + command + " nodes=" + JSON.stringify(nodes) + " " +
            JSON.stringify(data, (key, value) => {
            if (value != null && value instanceof crypto.HashId)
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
     * Get the processing state of paid operation.
     *
     * @param {HashId} operationId - Id of the paid operation to get state of.
     * @async
     * @return {Promise<ParcelProcessingState>} processing state of the paid operation.
     * @throws UBotClientException
     */
    async getPaidOperationProcessingState(operationId) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getPaidOperationProcessingState", {operationId: operationId},
                result => resolve(result),
                error => reject(error)
            )
        );

        let message = "Client.getPaidOperationProcessingState state: " + result.processingState.state;
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        return ParcelProcessingState.byVal.get(result.processingState.state);
    }

    /**
     * Process paid operation before creating session.
     *
     * @private
     * @param {Object} params - Parameters fro command "ubotCreateSessionPaid".
     * @param {HashId} paymentId - ID of payment contract.
     * @throws UBotClientException
     * @async
     * @return {boolean} Paid operation result.
     */
    async processPaidOperation(params, paymentId) {
        let paidOperationResult = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("ubotCreateSessionPaid", params,
                result => resolve(result),
                error => reject(error)
            )
        );

        let message = "Client.processPaidOperation ubotCreateSessionPaid result: " + JSON.stringify(paidOperationResult, (key, value) => {
            if ((key === "paidOperationId") && value != null && value instanceof crypto.HashId)
                return value.toString();
            else
                return value;
        });
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        if (!paidOperationResult.result)
            throw new UBotClientException("ubotCreateSessionPaid failed");

        while ((await this.getPaidOperationProcessingState(paidOperationResult.paidOperationId)).isProcessing)
            await sleep(100);

        let lastResult = await this.getState(paymentId);
        while (lastResult.state.isPending) {
            await sleep(100);
            lastResult = await this.getState(paymentId);
        }

        message = "Client.processPaidOperation item state: " + lastResult.state.val;
        if (this.logger != null)
            this.logger.log(message);
        else
            console.log(message);

        if (lastResult.state === ItemState.DECLINED)
            throw new UBotClientException("ubotCreateSessionPaid payment is DECLINED");

        return lastResult.state === ItemState.APPROVED;
    }

    static checkSessionIsNull(session) {
        if (session == null || session.state == null) {
            if (session != null && session.errors != null)
                throw new UBotClientException("Session is aborted. Errors: " + JSON.stringify(session.errors));
            else
                throw new UBotClientException("Session is null");
        }
    }

    /**
     * Creates a new session for the cloud method.
     *
     * @private
     * @param {Contract} requestContract - The Request contract.
     * @param {Contract | null} payment - The payment contract.
     * @async
     * @return {UBotSession} session.
     */
    async createSession(requestContract, payment) {
        let params = {packedRequest: await requestContract.getPackedTransaction()};
        let session = null;
        if (payment != null) {
            params.packedU = await payment.getPackedTransaction();

            if (!await this.processPaidOperation(params, payment.id)) {
                let errors = "";
                session = await this.getSession("ubotGetSession", {requestId: requestContract.id});
                if (session != null && session.errors != null)
                    errors = ": " + JSON.stringify(session.errors);

                throw new UBotClientException("Paid operation is not processed" + errors);
            }

            while (session == null || (session.state == null && session.errors == null))
                session = await this.getSession("ubotGetSession", {requestId: requestContract.id});
        } else
            session = await this.getSession("ubotCreateSession", params);

        UBotClient.checkSessionIsNull(session);

        let maxTime = 0;
        if (this.waitSession != null)
            maxTime = Date.now() + this.waitSession;

        do {
            // wait session requestId
            while (session.state === UBotSessionState.VOTING_REQUEST_ID.val) {
                if (this.waitSession != null && Date.now() > maxTime)
                    throw new UBotClientException("Session timeout limit exceeded");

                await sleep(UBotConfig.waitPeriod);
                session = await this.getSession("ubotGetSession", {requestId: requestContract.id});
            }

            UBotClient.checkSessionIsNull(session);

            if (session.requestId == null || !session.requestId.equals(requestContract.id))
                throw new UBotClientException("Unable to create session by request contract");
        } while (session.requestId == null);

        if (session.state === UBotSessionState.CLOSING.val)
            throw new UBotClientException("Session is closing");

        if (session.state === UBotSessionState.CLOSED.val)
            throw new UBotClientException("Session has been closed");

        // wait session id and pool
        while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.CLOSING.val &&
            session.state !== UBotSessionState.CLOSED.val) {

            if (this.waitSession != null && Date.now() > maxTime)
                throw new UBotClientException("Session timeout limit exceeded");

            await sleep(UBotConfig.waitPeriod);
            session = await this.getSession("ubotGetSession", {requestId: requestContract.id});

            UBotClient.checkSessionIsNull(session);
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
     * Get the state of the contract (given by its id) on the currently connected node.
     * Note: limits are applied to number of {@link #getState(Approvable)} calls
     * per minute per client key. Make sure method is not called too often with the same client connection.
     *
     * @param {HashId} itemId - To get state by itemId.
     * @async
     * @return known {ItemResult} if exist or ItemResult.UNDEFINED.
     */
    async getState(itemId) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getState", {itemId: itemId},
                result => resolve(result),
                error => reject(error)
            )
        );

        let ir = t.getOrThrow(result, "itemResult");
        if (ir instanceof ItemResult)
            return ir;

        if (typeof ir === "string")
            console.error("Register error, getState failed: " + ir);

        return ItemResult.UNDEFINED;
    }

    /**
     * Check contract state (for APPROVED) with defined trust level.
     *
     * @param itemId - ID of checking contract.
     * @param trustLevel - Trust level (between 0 and 1).
     * @param breakLevel - Level determining that contract has not been approved (between 0 and 1).
     *
     * @async
     * @return {Promise<boolean>} true - if contract has been approved.
     */
    async checkStateWithTrust(itemId, trustLevel, breakLevel) {
        let nodes = this.topology.map(node => node.number);
        let trust = Math.ceil(nodes.length * (trustLevel + breakLevel));
        let stop = Math.ceil(nodes.length * (trustLevel + breakLevel));
        let full = Math.ceil(nodes.length * (trustLevel + breakLevel));
        if (full > nodes.length)
            full = nodes.length;

        let selected = t.randomChoice(nodes, full);

        let states = await this.askOnSomeNodes("getState", {itemId: itemId}, selected);

        if (states == null || !states instanceof Array || states.length !== selected.length)
            throw new Error("checkStateWithTrust failed: askSessionOnSomeNodes must return array");

        let approved = 0;
        let declined = 0;
        for (let i = 0; i < states.length; i++) {
            if (typeof states[i] === "object" && states[i].itemResult != null && states[i].itemResult.state != null &&
                states[i].itemResult.state === ItemState.APPROVED)
                approved++;
            else
                declined++;

            if (approved >= trust)
                return true;

            if (declined >= stop)
                break;
        }

        return false;
    }

    /**
     * Register the contract on the network.
     *
     * @private
     * @param {Uint8Array} result - First register result.
     * @param {Uint8Array} packedTransaction - Binary contract for registration.
     * @param {number} millisToWait - Maximum time to wait for final ItemState or 0 if endless waiting.
     * @async
     * @return {ItemResult} result of registration or current state of registration (if wasn't finished yet).
     */
    async waitRegister(result, packedTransaction, millisToWait = 0) {
        let lastResult = result.itemResult;

        if (this.logger != null)
            this.logger.log("register first result: " + t.secureStringify(lastResult));
        else
            console.log("register first result: " + t.secureStringify(lastResult));

        if (lastResult instanceof ItemResult) {
            if (lastResult.state.isPending) {
                let end = Date.now() + millisToWait;
                try {
                    let c = await Contract.fromPackedTransaction(packedTransaction);
                    let interval = 1000;
                    while ((millisToWait === 0 || Date.now() < end) && lastResult.state.isPending) {
                        await sleep(interval);
                        if (interval > 300)
                            interval -= 350;

                        lastResult = await this.getState(c.id);

                        if (this.logger != null)
                            this.logger.log("register getState result: " + t.secureStringify(lastResult));
                        else
                            console.log("register getState result: " + t.secureStringify(lastResult));
                    }
                } catch (err) {
                    throw new UBotClientException("Register error: " + err.message);
                }
            }
            return lastResult;
        }

        return ItemResult.UNDEFINED;
    }

    /**
     * Register the contract on the network.
     *
     * @param {Uint8Array} packedTransaction - Binary contract for registration.
     * @param {number} millisToWait - Maximum time to wait for final ItemState or 0 if endless waiting.
     * @async
     * @return {Promise<ItemResult>} result of registration or current state of registration (if wasn't finished yet).
     */
    async register(packedTransaction, millisToWait = 0) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("approve", {packedItem: packedTransaction},
                result => resolve(result),
                error => reject(error)
            )
        );

        return this.waitRegister(result, packedTransaction, millisToWait);
    }

    /**
     * Get the processing state of given parcel.
     *
     * @param {HashId} parcelId - Id of the parcel to get state.
     * @async
     * @return {Promise<ParcelProcessingState>} processing state of the parcel.
     * @throws UBotClientException
     */
    async getParcelProcessingState(parcelId) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("getParcelProcessingState", {parcelId: parcelId},
                result => resolve(result),
                error => reject(error)
            )
        );

        return ParcelProcessingState.byVal.get(result.processingState.state);
    }

    /**
     * Register the contract on the network using parcel (to provide payment).
     *
     * @param {Uint8Array} packedParcel - Binary parcel.
     * @param {number} millisToWait - Maximum time to wait for final {@link ItemState}.
     * @return {Promise<ItemResult>} either final result of registration or last known status of registration.
     * Getting {@link ItemResult#UNDEFINED} means either.
     * payment wasn't processed yet or something is wrong with it (invalid or insufficient U).
     * @throws UBotClientException
     */
    async registerParcelWithState(packedParcel, millisToWait = 0) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("approveParcel", {packedItem: packedParcel},
                result => resolve(result),
                error => reject(error)
            )
        );

        result = result.result;

        if (typeof result === "string") {
            throw new UBotClientException("registerParcel: approveParcel returns: " + result);
        } else {
            if (millisToWait > 0) {
                let end = Date.now() + millisToWait;
                try {
                    let parcel = await Parcel.unpack(packedParcel);
                    let pState = await this.getParcelProcessingState(parcel.hashId);
                    let interval = 1000;
                    while ((millisToWait === 0 || Date.now() < end) && pState.isProcessing) {
                        await sleep(interval);
                        interval -= 350;
                        interval = Math.max(interval, 300);
                        pState = await this.getParcelProcessingState(parcel.hashId);
                    }

                    let lastResult = await this.getState(parcel.getPayloadContract().id);
                    while ((millisToWait === 0 || Date.now() < end) && lastResult.state.isPending) {
                        await sleep(interval);
                        interval -= 350;
                        interval = Math.max(interval, 300);
                        lastResult = await this.getState(parcel.getPayloadContract().id);
                    }

                    return lastResult;

                } catch (err) {
                    console.error(err.stack);
                    throw new UBotClientException(err.message);
                }
            } else
                throw new UBotClientException("registerParcel: waiting time is up, please update payload state later");
        }
    }

    /**
     * Register the contract on the network.
     *
     * @param {Uint8Array} packedTransaction - Binary contract for registration.
     * @param {HashId} sessionId - Session ID.
     * @param {number} millisToWait - Maximum time to wait for final ItemState or 0 if endless waiting.
     * @async
     * @return {Promise<ItemResult>} result of registration or current state of registration (if wasn't finished yet).
     */
    async ubotRegister(packedTransaction, sessionId, millisToWait = 0) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("ubotApprove", {packedItem: packedTransaction, sessionId: sessionId},
                result => resolve(result),
                error => reject(error)
            )
        );

        return this.waitRegister(result, packedTransaction, millisToWait);
    }

    /**
     * Check request (request and executable contracts) before create session.
     *
     * @param {Contract} requestContract - The Request contract.
     * @param {Contract} registryContract - The UBots registry contract.
     * @private
     * @throws {UBotClientException} client exception.
     */
    checkRequest(requestContract, registryContract) {
        if (requestContract == null)
            throw new UBotClientException("Request contract is null");

        if (requestContract.state.data.executable_contract_id == null)
            throw new UBotClientException("Error request contract: executable contact ID is not defined");

        if (requestContract.transactionPack == null || requestContract.transactionPack.referencedItems == null)
            throw new UBotClientException("Error request contract: executable contact is not found in transaction pack");

        // get executable contract
        let executableContract = ut.getExecutableContract(requestContract);

        if (executableContract == null)
            throw new UBotClientException("Error request contract: executable contact is not found in transaction pack");

        // check executable contract constraint
        let executableConstraint = requestContract.constraints.get("executable_contract_constraint");
        if (executableConstraint == null || !executableConstraint instanceof constr.Constraint)
            throw new UBotClientException("Error request contract: executable_contract_constraint is not defined");

        let conditions = executableConstraint.exportConditions(executableConstraint.conditions);
        if (!conditions.hasOwnProperty(constr.Constraint.conditionsModeType.all_of))
            throw new UBotClientException("Error request contract: executable_contract_constraint has incorrect format (expected all_of)");

        conditions = conditions[constr.Constraint.conditionsModeType.all_of];
        if (conditions == null || conditions.length === 0 ||
            (!conditions.includes("this.state.data.executable_contract_id==ref.id") &&
             !conditions.includes("ref.id==this.state.data.executable_contract_id")))
            throw new UBotClientException("Error request contract: executable_contract_constraint has incorrect format");

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

        // check launcher role
        if (executableContract.state.data.cloud_methods[methodName].hasOwnProperty("launcher")) {
            let launcher = executableContract.state.data.cloud_methods[methodName].launcher;
            if (typeof launcher !== "string")
                throw new UBotClientException("Error executable contract: starting cloud launcher role name is not string");

            if (!executableContract.state.roles.hasOwnProperty(launcher) || !executableContract.state.roles.launcher instanceof roles.Role)
                throw new UBotClientException("Error executable contract: role is not defined");

            // check launcher condition
            if (conditions == null || conditions.length < 2)
                throw new UBotClientException("Error request contract: launcher condition not found");

            if (!conditions.includes("this can_perform ref.state.roles." + launcher))
                throw new UBotClientException("Error request contract: launcher condition has incorrect format");
        }

        try {
            this.poolAndQuorum = ut.getPoolAndQuorum(requestContract, registryContract);
        } catch (err) {
            throw new UBotClientException(
                "Error executable contract: pool or quorum of starting cloud method is not defined in metadata (in state.data.cloud_methods). Error: "
                + err.message
            );
        }

        if (executableContract.state.data.js == null)
            throw new UBotClientException("Error executable contract: executable contact JS-code is not defined");
    }

    /**
     * Get UBot registry contract.
     *
     * @async
     * @return {Uint8Array} packed UBot registry contract.
     */
    async getUBotRegistryContract() {
        if (this.ubotRegistryContract == null) {
            let serviceContracts = await new Promise(async (resolve, reject) =>
                await this.httpNodeClient.command("getServiceContracts", null,
                    result => resolve(result),
                    error => reject(error)
                )
            );

            if (serviceContracts == null || serviceContracts.contracts == null ||
                serviceContracts.contracts.ubot_registry_contract == null)
                throw new UBotClientException("Unable to get ubot registry contract");

            this.ubotRegistryContract = serviceContracts.contracts.ubot_registry_contract;
        }

        return this.ubotRegistryContract;
    }

    /**
     * Start cloud method.
     * Requests the creation of a session with a randomly selected pool using the request contract. By default,
     * сreates a session with the id of the Request contract or throws an exception.
     * Waits until the session is assigned an id and a pool is calculated from it.
     * Then he asks for a contract with the registry and topology of UBots, connects to a random UBots from the pool on
     * which he runs the cloud method.
     *
     * @param {Contract} requestContract - The Request contract.
     * @param {Contract | null} payment - The payment contract.
     * @async
     * @return {UBotSession} session.
     * @throws {UBotClientException} client exception if cloud method can`t started.
     */
    async startCloudMethod(requestContract, payment) {
        if (this.httpUbotClient != null)
            throw new UBotClientException("Ubot is connected to the pool. First disconnect from the pool");

        // get ubot registry and topology
        let ubotRegistry = await Contract.fromSealedBinary(await this.getUBotRegistryContract());
        if (this.topologyUBotNet == null)
            await this.initTopology(ubotRegistry);

        this.checkRequest(requestContract, ubotRegistry);

        let session = await this.createSession(requestContract, payment);

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
     * @param {Contract | null} payment - The payment contract.
     * @async
     * @return {Promise<Object>} cloud method state gathered session pool consensus, fields in the object:
     *      state - method status,
     *      result - method result,
     *      errors - error list.
     * @throws {UBotClientException} client exception if session pool consensus is not reached.
     */
    async executeCloudMethod(requestContract, payment) {
        let session = await this.startCloudMethod(requestContract, payment);

        let quorum = this.poolAndQuorum.quorum;
        let states = [];
        let groups = new Map();
        let answered = new Set();

        while (true) {
            let gotStates = await Promise.all(session.pool.filter(ubotNumber => !answered.has(ubotNumber)).map(async (ubotNumber) => {
                let state = await this.getStateCloudMethod(requestContract.id, ubotNumber);

                if (state.state != null && !UBotPoolState.byVal.get(state.state).canContinue) {
                    answered.add(ubotNumber);
                    return state;
                } else
                    return null;
            }));

            for (let state of gotStates)
                if (state != null) {
                    states.push(state);

                    let groupKey = HashId.of(await Boss.dump(await BossBiMapper.getInstance().serialize(state))).base64;
                    let count = groups.get(groupKey);
                    if (count == null)
                        count = 0;

                    // check consensus
                    if (count + 1 >= quorum) {
                        await this.disconnectUbot();
                        return state;
                    } else {
                        groups.set(groupKey, count + 1);

                        // check consensus available
                        if (Array.from(groups.values()).every(c => c + session.pool.length - states.length < quorum)) {
                            await this.disconnectUbot();
                            throw new UBotClientException("Cloud method consensus can`t be reached, ubot states: " + t.secureStringify(states));
                        }
                    }
                }

            await sleep(UBotConfig.waitPeriod);
        }
    }

    /**
     * Gets a session from several nodes (until it receives).
     *
     * @param {HashId} requestId - The Request contract id.
     * @async
     * @return {Promise<{state}|Object|null>}
     */
    async getSessionWithTrust(requestId) {
        let session = await this.getSession("ubotGetSession", {requestId: requestId});

        if (session != null && session.state != null)
            return session;

        let nodes = this.topology.map(node => node.number);
        let trust = Math.ceil(nodes.length * UBotConfig.checkSessionTrustLevel);
        if (trust > nodes.length)
            trust = nodes.length;

        let selected = t.randomChoice(nodes, trust);

        let sessions = await this.askOnSomeNodes("ubotGetSession", {requestId: requestId}, selected);

        if (sessions == null || !sessions instanceof Array || sessions.length !== selected.length)
            throw new Error("askSessionOnSomeNodes must return array");

        for (let i = 0; i < sessions.length; i++)
            if (sessions[i] != null && sessions[i].session != null && sessions[i].session.state != null)
                return sessions[i].session;

        return null;
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
        let session = await this.getSessionWithTrust(requestContractId);

        UBotClient.checkSessionIsNull(session);

        let maxTime = 0;
        if (this.waitSession != null)
            maxTime = Date.now() + this.waitSession;

        if (session.state !== UBotSessionState.OPERATIONAL.val) {
            if (session.state !== UBotSessionState.VOTING_SESSION_ID.val)
                throw new UBotClientException("Session is not in operational mode");

            // wait session id and pool
            while (session.state !== UBotSessionState.OPERATIONAL.val && session.state !== UBotSessionState.CLOSING.val &&
                   session.state !== UBotSessionState.CLOSED.val) {

                if (this.waitSession != null && Date.now() > maxTime)
                    throw new UBotClientException("Session timeout limit exceeded");

                await sleep(UBotConfig.waitPeriod);
                session = await this.getSessionWithTrust(requestContractId);

                UBotClient.checkSessionIsNull(session);
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
     * If status “FAILED” means that the cloud method has completed with errors and
     * errors can be viewed in the “errors” field of the result.
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
        while (state.state == null || UBotPoolState.byVal.get(state.state).canContinue) {
            await sleep(UBotConfig.waitPeriod);
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
     * @return {Promise<void>}.
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

    /**
     * Connects the client to the UBot from which the ping command
     * will be sent to the specified UBot with a specific timeout.
     *
     * @param from - The UBot number to which the client connects and sends a ping command from it.
     * @param to - UBot number to which the ping team is sent.
     * @param {number} timeout - Ping timeout.
     * @async
     * @return {Promise<Object>} command result.
     */
    async pingUBot(from, to, timeout = 1500) {
        if (this.httpUbotClient != null)
            throw new UBotClientException("Ubot is connected to the pool. First disconnect from the pool");

        if (this.topologyUBotNet == null) {
            // get ubot registry and topology
            let ubotRegistry = await Contract.fromSealedBinary(await this.getUBotRegistryContract());
            await this.initTopology(ubotRegistry);
        }

        let client = await this.connectUbot(from);

        return await new Promise(async (resolve, reject) =>
            await client.command("pingUBot", {ubotNumber: to, timeoutMillis: timeout},
                result => resolve(result),
                error => reject(error)
            )
        );
    }

    /**
     * Request UNS contract by name.
     *
     * @param name - Name registered in UNS contract.
     * @param type - Contract type (UNS1 or UNS2).
     *
     * @async
     * @return {Promise<Uint8Array>} UNS contract body.
     */
    async queryNameContract(name, type) {
        let result = await new Promise(async (resolve, reject) =>
            await this.httpNodeClient.command("queryNameContract", {name: name, type: type},
                result => resolve(result),
                error => reject(error)
            )
        );

        if (result == null)
            return null;

        return result.packedContract;
    }
}

class UBotTestClient extends UBotClient {
    constructor(hostUbotForReplace, clientPrivateKey, topologyInput, topologyCacheDir) {
        super(clientPrivateKey, topologyInput, topologyCacheDir);
        this.hostUbotForReplace = hostUbotForReplace;
    }

    replaceURL(URL) {
        if (!URL.startsWith(this.hostUbotForReplace))
            URL = this.hostUbotForReplace + URL.substring(URL.indexOf(':', 6));
        console.log("Replaced URL = " + URL);

        return URL;
    }
}

module.exports = {UBotClient, UBotTestClient};