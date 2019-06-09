import {MemoiseMixin} from 'tools'
import * as io from "io";
import * as t from "tools";
import * as trs from 'timers'
import {PublicKey} from "crypto";
const Boss = require('boss.js');
const yaml = require('yaml');
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const ClientError = e.ClientError;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
//const BossBiMapper = require("bossbimapper").BossBiMapper;

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
            let data = yaml.load(await (await io.openRead(fileName)).allAsString());

            let nodeName = t.getOrThrow(data, "node_name");

            let nodePathEnd = "/nodes/" + nodeName + ".yaml";
            if (!fileName.endsWith(nodePathEnd))
                throw new Error("Incorrect path to node " + nodeName);

            let keyPath = fileName.substring(0, fileName.length - nodePathEnd.length) + "/keys/" + nodeName + ".public.unikey";
            //console.log("expected key file path: <" + keyPath + ">");

            let key = new PublicKey(await (await io.openRead(keyPath)).allBytes());
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
        return this.publicHost === "localhost" ?
            "http://localhost:" + this.clientAddress.port :
            "http://" + this.publicHost + ":" + this.publicPort;
    }

    serverUrlString() {
        return this.publicHost === "localhost" ?
            "http://localhost:" + this.clientAddress.port :
            "http://" + (this.hostV6 != null ? "[" + this.hostV6 + "]" : this.host) + ":" + this.publicPort;
    }

    domainUrlStringV4() {
        return this.publicHost === "localhost" ?
            "https://localhost:" + this.clientAddress.port :
            "https://" + this.publicHost + ":" + this.publicPort;
    }

    directUrlStringV4() {
        return this.publicHost === "localhost" ?
            "http://localhost:" + this.clientAddress.port :
            "http://" + this.host + ":" + this.publicPort;
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
    }

    send(destNodeNumber, payload) {
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

    get method() {
        return this.memoise('__getMethod', () => this.reqBuf_.getMethod(this.indx_));
    }

    get requestBody() {
        return this.memoise('__getRequestBody', () => this.reqBuf_.getRequestBody(this.indx_));
    }
};
Object.assign(network.HttpServerRequest.prototype, MemoiseMixin);

network.HttpServer = class {
    constructor(host, port, poolSize, bufSize) {
        this.httpServer_ = new network.HttpServerImpl(host, port, poolSize, bufSize);
        this.endpoints_ = new Map();
        this.secureEndpoints_ = new Map();

        this.timers_ = [];
        this.reqBufs = [];
        this.secureReqBufs = [];

        this.httpServer_.__setBufferedCallback(async (reqBuf) => {
            this.reqBufs.push(reqBuf);
        });
        this.httpServer_.__setBufferedSecureCallback(async (reqBuf) => {
            this.secureReqBufs.push(reqBuf);
        });

        this.addTimer(10, async () => {
            await this.processReqBufs();
            await this.processSecureReqBufs();
        });

    }

    addTimer(delay, block) {
        let i = this.timers_.length;
        let f = () => {
            block();
            this.timers_[i] = trs.timeout(delay, f);
        };
        this.timers_[i] = trs.timeout(delay, f);
    }

    async processReqBufs() {
        let reqBufs = this.reqBufs;
        this.reqBufs = [];
        for (let k = 0; k < reqBufs.length; ++k) {
            let reqBuf = reqBufs[k];
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
        }
    }

    async processSecureReqBufs() {
        let secureReqBufs = this.secureReqBufs;
        this.secureReqBufs = [];
        for (let k = 0; k < secureReqBufs.length; ++k) {
            let reqBuf = secureReqBufs[k];
            let length = reqBuf.getBufLength();
            let promises = [];
            for (let i = 0; i < length; ++i) {
                let params = Boss.load(reqBuf.getParamsBin(i));
                let sessionKey = new crypto.SymmetricKey(reqBuf.getSessionKeyBin(i));
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
                        promises.push(this.processSecureCommand(params, sessionKey));
                }
            }
            let results = await Promise.all(promises);
            for (let i = 0; i < length; ++i) {
                reqBuf.setAnswer(i, Boss.dump(results[i]));
            }
        }
    }

    processSecureCommand(params, sessionKey) {
        try {
            if (this.secureEndpoints_.has(params.command))
                return new Promise(async resolve=>{
                    resolve({result: await this.secureEndpoints_.get(params.command)(params, sessionKey)});
                });
            else {
                throw new ErrorRecord(Errors.UNKNOWN_COMMAND, "command", "unknown: " + params.command);
            }
        } catch (e) {
            return {error: DefaultBiMapper.getInstance().serialize(e)};
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
        for (let i = 0; i < this.timers_.length; ++i)
            trs.clearTimeout(this.timers_[i]);

        //wait for delayed timer callbacks
        await sleep(300);
    }

    addRawEndpoint(endpoint, block) {
        this.httpServer_.__addEndpoint(endpoint);
        this.endpoints_.set(endpoint, block);
    }

    addEndpoint(endpoint, block) {
        this.httpServer_.__addEndpoint(endpoint);
        this.endpoints_.set(endpoint, async (request)=>{
            try {
                request.setAnswerBody(Boss.dump({
                    "result": "ok",
                    "response": await block(request)
                }));
            } catch (e) {
                request.setAnswerBody(Boss.dump({
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
    constructor(rootUrl, poolSize, bufSize) {
        this.httpClient_ = new network.HttpClientImpl(rootUrl, poolSize, bufSize);
        this.callbacks_ = new Map();
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
        this.httpClient_.__setBufferedCommandCallback((ansArr) => {
            for (let i = 0; i < Math.floor(ansArr.length/2); ++i) {
                let reqId = ansArr[i*2 + 0];
                if (this.callbacks_.has(reqId)) {
                    this.callbacks_.get(reqId)(ansArr[i*2 + 1]);
                    this.callbacks_.delete(reqId);
                }
            }
        });
    }

    start(clientPrivateKey, nodePublickey, session) {
        return new Promise((resolve, reject) => {
            this.httpClient_.__start(clientPrivateKey.packed, nodePublickey.packed, ()=>{
                resolve();
            });
        });
    }

    sendGetRequest(url, block) {
        let reqId = this.getReqId();
        this.callbacks_.set(reqId, block);
        this.httpClient_.__sendGetRequest(reqId, url);
    }

    command(name, params, onComplete, onError) {
        let paramsBin = Boss.dump({"command": name, "params": params});
        let reqId = this.getReqId();
        this.callbacks_.set(reqId, (decrypted) => {
            let binder = Boss.load(decrypted);
            let result = binder.result;
            if (result) {
                onComplete(result);
            } else {
                let errorRecord = new ErrorRecord(Errors.FAILURE, "", "unprocessablereply");
                if (binder.error)
                    errorRecord = DefaultBiMapper.getInstance().deserialize(binder.error);
                let clientError = ClientError.initFromErrorRecord(errorRecord);
                onError(clientError);
            }
        });
        this.httpClient_.__command(reqId, paramsBin);
    }

    getReqId() {
        let id = this.nextReqId_;
        this.nextReqId_ += 1;
        if (this.nextReqId_ > 2000000000)
            this.nextReqId_ = 1;
        return id;
    }
};

module.exports = network;
