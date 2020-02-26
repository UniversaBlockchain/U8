/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {MemoiseMixin} from 'tools'
import * as io from "io";
import * as t from "tools";
import {PublicKey} from "crypto";
const Boss = require('boss.js');
const yaml = require('yaml');
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const ClientError = e.ClientError;
//const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;

network.NodeInfo = class {
    constructor() {
        this.nodeInfo_ = null;
    }

    static copyImpl(nodeInfoImpl) {
        let res = new network.NodeInfo();
        res.nodeInfo_ = nodeInfoImpl;
        return res;
    }

    static withParameters(publicKey, number, nodeName, host, hostV6, publicHost, datagramPort, clientHttpPort, publicHttpPort) {
        let res = new network.NodeInfo();
        res.nodeInfo_ = new network.NodeInfoImpl(
            publicKey.packed, number, nodeName, host, hostV6, publicHost, datagramPort, clientHttpPort, publicHttpPort);
        return res;
    }

    equals(to) {
        if (this === to)
            return true;

        if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        return this.number === to.number;
    }

    get publicKey() {
        return this.memoise('__getPublicKey', () => new crypto.PublicKey(this.nodeInfo_.__getPublicKey()));
    }

    get nodeAddress() {
        return this.memoise('__getNodeAddress', () => network.SocketAddress.copyImpl(this.nodeInfo_.__getNodeAddress()));
    }

    get clientAddress() {
        return this.memoise('__getClientAddress', () => network.SocketAddress.copyImpl(this.nodeInfo_.__getClientAddress()));
    }

    get number() {
        return this.memoise('__getNumber', () => this.nodeInfo_.__getNumber());
    }

    get name() {
        return this.memoise('__getName', () => this.nodeInfo_.__getName());
    }

    get publicHost() {
        return this.memoise('__getPublicHost', () => this.nodeInfo_.__getPublicHost());
    }

    get host() {
        return this.memoise('__getHost', () => this.nodeInfo_.__getHost());
    }

    get hostV6() {
        return this.memoise('__getHostV6', () => this.nodeInfo_.__getHostV6());
    }

    get publicPort() {
        return this.memoise('__getPublicPort', () => this.nodeInfo_.__getPublicPort());
    }

    static async loadYaml(fileName) {
        try {
            let data = yaml.load(await io.fileGetContentsAsString(fileName));

            let nodeName = t.getOrThrow(data, "node_name");

            let nodePathEnd = "/nodes/" + nodeName + ".yaml";
            if (!fileName.endsWith(nodePathEnd))
                throw new Error("Incorrect path to node " + nodeName);

            let keyPath = fileName.substring(0, fileName.length - nodePathEnd.length) + "/keys/" + nodeName + ".public.unikey";
            //console.log("expected key file path: <" + keyPath + ">");

            let key = new PublicKey(await io.fileGetContentsAsBytes(keyPath));
            return network.NodeInfo.withParameters(key,
                t.getOrThrow(data, "node_number"),
                nodeName,
                t.getOrThrow(data, "ip")[0],
                data.hasOwnProperty("ipv6") ? data.ipv6[0] : null,
                t.getOrThrow(data, "public_host"),
                t.getOrThrow(data, "udp_server_port"),
                t.getOrThrow(data, "http_client_port"),
                t.getOrThrow(data, "http_public_port"));

        } catch (err) {
            console.error("failed to load node: " + fileName + ": " + err.message);
            if (err.stack != null)
                console.error(err.stack);
        }

        return null;
    }

    publicUrlString() {
        return "http://" + this.publicHost + ":" + this.publicPort;
    }

    serverUrlString() {
        return "http://" + ((this.hostV6 != null && this.hostV6 !== "null") ? "[" + this.hostV6 + "]" : this.host) + ":" + this.publicPort;
    }

    domainUrlStringV4() {
        return "https://" + this.publicHost + ":" + this.publicPort;
    }

    directUrlStringV4() {
        return "http://" + this.host + ":" + this.publicPort;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.number.toString();

        return this.stringId_;
    }
};
Object.assign(network.NodeInfo.prototype, MemoiseMixin);

network.SocketAddress = class {
    constructor(host, port) {
        this.socketAddress_ = new network.SocketAddressImpl(host, port);
    }

    static copyImpl(socketAddressImpl) {
        let res = new network.SocketAddress("", 0);
        res.socketAddress_ = socketAddressImpl;
        return res;
    }

    get host() {
        return this.memoise('__getHost', () => this.socketAddress_.__getHost());
    }

    get port() {
        return this.memoise('__getPort', () => this.socketAddress_.__getPort());
    }
};
Object.assign(network.SocketAddress.prototype, MemoiseMixin);

network.NetConfig = class {
    constructor() {
        this.netConfig_ = new network.NetConfigImpl();
    }

    addNode(nodeInfo) {
        this.netConfig_.__addNode(nodeInfo.nodeInfo_);
    }

    getInfo(nodeNumber) {
        return network.NodeInfo.copyImpl(this.netConfig_.__getInfo(nodeNumber));
    }

    find(nodeNumber) {
        return this.netConfig_.__find(nodeNumber);
    }

    toList() {
        let res = [];
        let implList = this.netConfig_.__toList();
        for (let i = 0; i < implList.length; ++i)
            res.push(network.NodeInfo.copyImpl(implList[i]))
        return res;
    }

    get size() {
        return this.memoise('__getSize', () => this.netConfig_.__getSize());
    }

    static async loadByPath(path) {
        let netConfig = new network.NetConfig();

        if (!await io.isDir(path))
            throw new Error("Incorrect path to nodes directory: " + path);

        let files = await io.getFilesFromDir(path);
        let basePath = path.endsWith("/") ? path : path + "/";

        for (let file of files)
            if (file.endsWith(".yaml"))
                netConfig.addNode(await network.NodeInfo.loadYaml(basePath + file));

        return netConfig;
    }
};
Object.assign(network.NetConfig.prototype, MemoiseMixin);

network.UDPAdapter = class {
    constructor(ownPrivateKey, ownNodeNumber, netConfig) {
        this.udpAdapter_ = new network.UDPAdapterImpl(ownPrivateKey.packed, ownNodeNumber, netConfig.netConfig_);
        this.netConfig_ = netConfig;
        this.isClosed = false;
    }

    send(destNodeNumber, payload) {
        if (this.isClosed)
            return;
        let data = typeof(payload) == 'string' ? utf8Encode(payload) : payload;
        this.udpAdapter_.__send(destNodeNumber, data);
    }

    setReceiveCallback(callback) {
        this.udpAdapter_.__setReceiveCallback((arr)=>{
            for (let i = 0; i < Math.floor(arr.length/2); ++i) {
                let packet = arr[i*2];
                let fromNode = arr[i*2 + 1];
                callback(packet, this.netConfig_.getInfo(fromNode));
            }
        });
    }

    close() {
        this.isClosed = true;
        this.udpAdapter_.__close();
    }
};

class HttpServerError extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

network.HttpServerRequest = class {
    constructor(reqBuf, indx) {
        this.reqBuf_ = reqBuf;
        this.indx_ = indx;
    }

    setStatusCode(code) {
        this.reqBuf_.setStatusCode(this.indx_, code);
    }

    setHeader(key, value) {
        this.reqBuf_.setHeader(this.indx_, key, value);
    }

    setAnswerBody(body) {
        this.reqBuf_.setAnswerBody(this.indx_, typeof(body) == 'string' ? utf8Encode(body) : body);
    }

    sendAnswer() {
        this.reqBuf_.sendAnswer(this.indx_);
    }

    get endpoint() {
        return this.memoise('__getEndpoint', () => this.reqBuf_.getEndpoint(this.indx_));
    }

    get path() {
        return this.memoise('__getPath', () => this.reqBuf_.getPath(this.indx_));
    }

    get queryString() {
        return this.memoise('__queryString', () => this.reqBuf_.getQueryString(this.indx_));
    }

    get queryParamsMap() {
        if (!this.queryParamsMap_) {
            this.queryParamsMap_ = new Map();
            let s = this.queryString;
            let pairs = s.split('&');
            for (let i = 0; i < pairs.length; ++i) {
                let p = pairs[i].split('=');
                this.queryParamsMap_.set(decodeURIComponent(p[0]), decodeURIComponent(p[1]));
            }
        }
        return this.queryParamsMap_;
    }

    get multipartParams() {
        return this.memoise('__multipartParams', () => this.reqBuf_.getMultipartParams(this.indx_));
    }

    get method() {
        return this.memoise('__getMethod', () => this.reqBuf_.getMethod(this.indx_));
    }

    get requestBody() {
        return this.memoise('__getRequestBody', () => this.reqBuf_.getRequestBody(this.indx_));
    }
};
Object.assign(network.HttpServerRequest.prototype, MemoiseMixin);

network.HttpServer = class {
    constructor(host, port, poolSize) {
        let bufSize = Math.max(32, poolSize);
        this.httpServer_ = new network.HttpServerImpl(host, port, poolSize, bufSize);
        this.endpoints_ = new Map();
        this.secureEndpoints_ = new Map();

        this.httpServer_.__setBufferedCallback(async (reqBuf) => {
            let length = reqBuf.getBufLength();
            let promises = [];
            for (let i = 0; i < length; ++i) {
                let req = new network.HttpServerRequest(reqBuf, i);
                let endpoint = req.endpoint;
                if (this.endpoints_.has(endpoint)) {
                    promises.push(this.endpoints_.get(endpoint)(req));
                } else {
                    req.setStatusCode(404);
                    req.setAnswerBody("404 page not found");
                    req.sendAnswer();
                }
            }
            await Promise.all(promises);
        });

        this.httpServer_.__setBufferedSecureCallback(async (reqBuf) => {
            let length = reqBuf.getBufLength();
            let promises = [];
            for (let i = 0; i < length; ++i) {
                let params = await BossBiMapper.getInstance().deserialize(await Boss.load(reqBuf.getParamsBin(i)));
                let clientPublicKey = new crypto.PublicKey(reqBuf.getPublicKeyBin(i));
                switch (params.command) {
                    case "hello":
                        promises.push({result: {status: "OK", message: "welcome to the Universa"}});
                        break;
                    case "sping":
                        promises.push({result: {sping: "spong"}});
                        break;
                    case "test_error":
                        throw new Error("sample error");
                        break;
                    default:
                        promises.push(await this.processSecureCommand(params, clientPublicKey));
                }
            }
            let results = await Promise.all(promises);
            for (let i = 0; i < length; ++i) {
                reqBuf.setAnswer(i, await Boss.dump(await BossBiMapper.getInstance().serialize(results[i])));
            }
        });
    }

    async processSecureCommand(params, clientPublicKey) {
        try {
            if (this.secureEndpoints_.has(params.command))
                return new Promise(async resolve=>{
                    this.secureEndpoints_.get(params.command)(params.params, clientPublicKey)
                        .then(r => {
                            resolve({result: r});
                        })
                        .catch(err => {
                            resolve({error: new ErrorRecord(Errors.COMMAND_FAILED, params.command, err.toString())});
                        });
                });
            else {
                throw new ErrorRecord(Errors.UNKNOWN_COMMAND, "command", "unknown: " + params.command);
            }
        } catch (e) {
            return {error: await BossBiMapper.getInstance().serialize(e)};
        }
    }

    initSecureProtocol(ownNodePrivateKey) {
        this.httpServer_.__initSecureProtocol(ownNodePrivateKey.packed);
    }

    startServer() {
        this.httpServer_.__startServer();
    }

    async stopServer() {
        this.httpServer_.__stopServer();
        this.httpServer_ = null;
    }

    addRawEndpoint(endpoint, block) {
        this.httpServer_.__addEndpoint(endpoint);
        this.endpoints_.set(endpoint, block);
    }

    addEndpoint(endpoint, block) {
        this.httpServer_.__addEndpoint(endpoint);
        this.endpoints_.set(endpoint, async (request)=>{
            try {
                request.setAnswerBody(await Boss.dump({
                    "result": "ok",
                    "response": await block(request)
                }));
            } catch (e) {
                request.setAnswerBody(await Boss.dump({
                    "result": "error",
                    "error": e.message,
                    "errorClass": e.constructor.name
                }));
            }
            request.sendAnswer();
        });
    }

    addSecureEndpoint(commandName, block) {
        this.secureEndpoints_.set(commandName, block);
    }
};

network.HttpClient = class {
    constructor(rootUrl) {
        this.autoReconnectOnCommandError = true;
        this.retryCount = 5; // total count of tries
        this.retryTimeoutMillis = 2000;
        this.clientPrivateKey = null;
        this.nodePublickey = null;
        this.httpClient_ = new network.HttpClientImpl(rootUrl);
        this.callbacks_ = new Map();
        this.callbacksCommands_ = new Map();
        this.isRestartingNow = false;
        this.isRestartingRequired = false;
        this.nextReqId_ = 1;
        this.httpClient_.__setBufferedCallback((ansArr) => {
            for (let i = 0; i < Math.floor(ansArr.length/3); ++i) {
                let reqId = ansArr[i*3 + 0];
                if (this.callbacks_.has(reqId)) {
                    this.callbacks_.get(reqId)(ansArr[i*3 + 1], ansArr[i*3 + 2]);
                    this.callbacks_.delete(reqId);
                }
            }
        });
        this.httpClient_.__setBufferedCommandCallback(async (ansArr) => {
            let promises = [];
            for (let i = 0; i < Math.floor(ansArr.length/3); ++i) {
                let reqId = ansArr[i*3 + 0];
                if (this.callbacksCommands_.has(reqId)) {
                    let cb = this.callbacksCommands_.get(reqId)
                    this.callbacksCommands_.delete(reqId);
                    promises.push(cb(ansArr[i*3 + 1], ansArr[i*3 + 2]));
                }
            }
            await Promise.all(promises);
        });
    }

    /**
     * Http client would start automatically on first command, with 'restart' procedure.
     */
    start(clientPrivateKey, nodePublickey, session) {
        this.clientPrivateKey = clientPrivateKey;
        this.nodePublickey = nodePublickey;
        return new Promise((resolve, reject) => {this.command("hello", {}, resolve, reject)});
    }

    /**
     * Really performs start procedure. Used from 'restart' procedure.
     */
    start0(clientPrivateKey, nodePublickey, session) {
        this.clientPrivateKey = clientPrivateKey;
        this.nodePublickey = nodePublickey;
        return new Promise((resolve, reject) => {
            this.httpClient_.__start(clientPrivateKey.packed, nodePublickey.packed, ()=>{
                resolve();
            }, (errText)=>{
                reject(errText);
            });
        });
    }

    async restart() {
        this.isRestartingRequired = true;
        while (this.callbacksCommands_.size > 0)
            await sleep(100);
        if (!this.isRestartingNow) {
            this.isRestartingNow = true;
            this.httpClient_.__clearSession();
            try {
                await this.start0(this.clientPrivateKey, this.nodePublickey, null);
            } catch (e) {
                //do nothing, just await rejected promise
            }
            this.isRestartingNow = false;
        }
        this.isRestartingRequired = false;
    }

    async stop() {
        this.httpClient_.__stop();
        this.httpClient_ = null;
    }

    sendGetRequest(path, block) {
        let reqId = this.getReqId();
        this.callbacks_.set(reqId, block);
        this.httpClient_.__sendGetRequest(reqId, path);
    }

    sendGetRequestUrl(url, block) {
        let reqId = this.getReqId();
        this.callbacks_.set(reqId, block);
        this.httpClient_.__sendGetRequestUrl(reqId, url);
    }

    checkBoundary(boundary, formParams, files) {
        for (let paramName in formParams) {
            if (typeof formParams[paramName] !== "function") {
                let paramValue = formParams[paramName].toString();
                if (paramValue.indexOf(boundary) !== -1)
                    return false;
            }
        }
        for (let paramName in files) {
            if (typeof files[paramName] !== "function") {
                let binData = files[paramName];
                let strData = utf8Decode(binData);
                if (strData.indexOf(boundary) !== -1)
                    return false;
            }
        }
        return true;
    }

    generateBoundary(formParams, files) {
        let counter = 0;
        do {
            let boundary = t.randomString(32);
            if (this.checkBoundary(boundary, formParams, files))
                return boundary;
        } while (++counter < 10);
        throw new Error("failed to create http multipart boundary");
    }

    /**
     * @param url {String} full url to server endpoint
     * @param method {String} GET, POST, etc
     * @param formParams {Object} where key is param name, value is String param value
     * @param files {Object} where key is param name, value is binary of file contents
     * @param block onComplete callback
     */
    sendMultipartRequestUrl(url, method, formParams, files, block) {
        let boundary = this.generateBoundary(formParams, files);
        let extHeaders = "User-Agent: Universa U8 API Client\r\n";
        extHeaders += "connection: close\r\n";
        extHeaders += "Content-Type: multipart/form-data; boundary="+boundary+"\r\n";

        let bodyStr = "";

        for (let paramName in formParams) {
            if (typeof formParams[paramName] !== "function") {
                bodyStr += "--" + boundary + "\r\n";
                bodyStr += "Content-Disposition: form-data; name=\""+paramName+"\"\r\n";
                bodyStr += "\r\n";
                bodyStr += formParams[paramName].toString();
                bodyStr += "\r\n";
            }
        }

        let fileCounter = 0;
        for (let paramName in files) {
            if (typeof files[paramName] !== "function") {
                let binData = files[paramName];
                let strData = utf8Decode(binData);
                bodyStr += "--" + boundary + "\r\n";
                bodyStr += "Content-Disposition: form-data; name=\""+paramName+"\"; filename=\"file_"+fileCounter+"\"\r\n";
                bodyStr += "Content-Type: application/octet-stream\r\n";
                bodyStr += "\r\n";
                bodyStr += strData;
                bodyStr += "\r\n";
                ++fileCounter;
            }
        }
        bodyStr += "--" + boundary + "--\r\n";

        let reqId = this.getReqId();
        this.callbacks_.set(reqId, block);
        this.httpClient_.__sendRawRequestUrl(reqId, url, method, extHeaders, utf8Encode(bodyStr));
    }

    async command(name, params, onComplete, onError) {
        let paramsBin = await Boss.dump(await BossBiMapper.getInstance().serialize({"command": name, "params": params}));

        let tryCounter = 0;

        let onExecCommandError = async (clientError) => {
            tryCounter += 1;
            if ((tryCounter >= this.retryCount) || (clientError && clientError.errorRecord.error == Errors.UNKNOWN_COMMAND)) {
                onError(clientError);
            } else {
                await sleep(this.retryTimeoutMillis);
                await this.restart();
                await execCommand();
            }
        };

        let execCommand = async () => {
            while (this.isRestartingNow || this.isRestartingRequired)
                await sleep(100);
            let reqId = this.getReqId();
            this.callbacksCommands_.set(reqId, async (decrypted, isError) => {
                if (isError !== true) {
                    let binder = await BossBiMapper.getInstance().deserialize(await Boss.load(decrypted));
                    let result = binder.result;
                    if (result) {
                        await onComplete(result);
                    } else {
                        let errorRecord = new ErrorRecord(Errors.FAILURE, "", "unprocessablereply");
                        if (binder.error)
                            errorRecord = await BossBiMapper.getInstance().deserialize(binder.error);
                        let clientError = ClientError.initFromErrorRecord(errorRecord);
                        await onExecCommandError(clientError);
                    }
                } else {
                    await onExecCommandError(new ClientError(utf8Decode(decrypted)));
                }
            });
            this.httpClient_.__command(reqId, paramsBin);
        };

        await execCommand();

    }

    getReqId() {
        let id = this.nextReqId_;
        this.nextReqId_ += 1;
        if (this.nextReqId_ > 2000000000)
            this.nextReqId_ = 1;
        return id;
    }
};

network.DnsServerQuestion = class {
    constructor(questionWrapper) {
        this.questionWrapper = questionWrapper;
    }

    get name() {
        return this.memoise('__getName', () => this.questionWrapper.__getName());
    }

    get rType() {
        return this.memoise('__getRType', () => this.questionWrapper.__getRType());
    }

    addAnswer_typeA(ttl, ipV4string) {
        this.questionWrapper.__addAnswer_typeA(ttl, ipV4string);
    }

    addAnswer_typeAAAA(ttl, ipV6string) {
        this.questionWrapper.__addAnswer_typeAAAA(ttl, ipV6string);
    }

    sendAnswer() {
        this.questionWrapper.__sendAnswer();
    }

    resolveThroughUplink() {
        this.questionWrapper.__resolveThroughUplink();
    }
};
Object.assign(network.DnsServerQuestion.prototype, MemoiseMixin);

network.DnsRRType = {
    DNS_ANY: 255,
    DNS_A: 1,
    DNS_AAAA: 28,
};

network.DnsServer = class {
    constructor() {
        this.dnsServer_ = new network.DnsServerImpl();
    }

    setQuestionCallback(block) {
        this.dnsServer_.__setQuestionsCallback(questionWrapper => {
            block(new network.DnsServerQuestion(questionWrapper));
        });
    }

    start(host, port, uplinkNameServer, uplinkPort = 53) {
        this.dnsServer_.__start(host, port, uplinkNameServer, uplinkPort);
    }

    stop() {
        return new Promise(resolve => this.dnsServer_.__stop(resolve));
    }
};

module.exports = network;
