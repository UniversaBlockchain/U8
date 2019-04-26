import {MemoiseMixin} from 'tools'

network.NodeInfo = class {
    constructor() {
        this.nodeInfo_ = null;
    }

    static copyImpl(nodeInfoImpl) {
        let res = new network.NodeInfo();
        res.nodeInfo_ = nodeInfoImpl;
        return res;
    }

    static withParameters(publicKey, number, nodeName, host, publicHost, datagramPort, clientHttpPort, serverHttpPort) {
        let res = new network.NodeInfo();
        res.nodeInfo_ = new network.NodeInfoImpl(
            publicKey.packed, number, nodeName, host, publicHost, datagramPort, clientHttpPort, serverHttpPort);
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

    get serverAddress() {
        return this.memoise('__getServerAddress', () => network.SocketAddress.copyImpl(this.nodeInfo_.__getServerAddress()));
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
};

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

network.HttpServer = class {
    constructor(host, port, poolSize) {
        this.httpServer_ = new network.HttpServerImpl(host, port, poolSize);
    }

    startServer() {
        this.httpServer_.__startServer();
    }

    stopServer() {
        this.httpServer_.__stopServer();
    }

    addEndpoint(endpoint, block) {
        this.httpServer_.__addEndpoint(endpoint, block);
    }

    addSecureEndpoint(endpoint, block) {
        throw new HttpServerError("not implemented");
    }
};

network.HttpClient = class {
    constructor(poolSize) {
        this.httpClient_ = new network.HttpClientImpl(poolSize);
    }

    sendGetRequest(url, block) {
        this.httpClient_.__sendGetRequest(url, block);
    }
};

module.exports = network;
