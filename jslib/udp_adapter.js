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
};

network.UDPAdapter = class {
    constructor(ownPrivateKey, ownNodeNumber, netConfig) {
        this.udpAdapter_ = new network.UDPAdapterImpl(ownPrivateKey.packed, ownNodeNumber, netConfig.netConfig_, ()=>{});
    }

    send(destNodeNumber, payload) {
        let data = typeof(payload) == 'string' ? utf8Encode(payload) : payload;
        this.udpAdapter_.__send(destNodeNumber, data);
    }
};

module.exports = network;
