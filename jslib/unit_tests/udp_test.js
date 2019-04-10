import {expect, unit, assert, assertSilent} from 'test'
import {NodeInfo} from 'udp_adapter'
import * as tk from 'unit_tests/test_keys'

unit.test("hello network", async () => {
    console.log();
    let newKey = await crypto.PrivateKey.generate(2048);
    console.log("newKey: " + newKey.publicKey.shortAddress);
    let t0 = new Date().getTime();
    let i0 = 0;
    let sum = 0;
    let n = network.NodeInfo.withParameters(newKey.publicKey, 33, "node-33", "127.0.0.1", "192.168.1.101", 7007, 8008, 9009);
    let nc = new network.NetConfig();
    //nc.addNode(n);
    //for (let i = 0; i < 1000000000; ++i) {
    for (let i = 0; i < 1000; ++i) {
        let n = network.NodeInfo.withParameters(newKey.publicKey, i, 2, 3, 4, 5, 6, 7);
        nc.addNode(n);
        let ncopy = nc.getInfo(n.number);
        n.publicKey.shortAddress;
        n.number;
        n.nodeAddress;
        n.clientAddress;
        n.serverAddress;
        n.name;
        // console.log(n.name);
        // console.log("nodeAddress: ", n.nodeAddress.host, n.nodeAddress.port);
        // console.log("clientAddress: ", n.clientAddress.host, n.clientAddress.port);
        // console.log("serverAddress: ", n.serverAddress.host, n.serverAddress.port);
        // let s = new network.SocketAddress("localhost", 3333);
        // s.host;
        // s.port;
        //sum += n.getNumber();
        //console.log(n.getNumber());
        if (new Date().getTime() - t0 >= 1000) {
            console.log("i = " + i + ", speed = " + (i - i0) + ", sum = " + sum);
            t0 = new Date().getTime();
            i0 = i;
            //gc();
        }
    }
    //console.log(n);
});

unit.test("network.SocketAddress", async () => {
    let s = new network.SocketAddress("localhost", 3333);
    assert(s.host === "localhost");
    assert(s.port === 3333);
});

unit.test("network.NodeInfo", async () => {
    let newKey = await crypto.PrivateKey.generate(2048);
    let n = network.NodeInfo.withParameters(newKey.publicKey, 33, "node-33", "127.0.0.1", "192.168.1.101", 7007, 8008, 9009);
    assert(n.number === 33);
    assert(n.name === "node-33");
    assert(n.publicKey.equals(newKey.publicKey));
    assert(n.nodeAddress.host === "127.0.0.1");
    assert(n.nodeAddress.port === 7007);
    assert(n.clientAddress.host === "192.168.1.101");
    assert(n.clientAddress.port === 8008);
    assert(n.serverAddress.host === "127.0.0.1");
    assert(n.serverAddress.port === 9009);
});

unit.test("network.NetConfig", async () => {
    let nc = new network.NetConfig();
    let pk1 = tk.TestKeys.getKey();
    let pk2 = tk.TestKeys.getKey();
    let pk3 = tk.TestKeys.getKey();
    let n1 = network.NodeInfo.withParameters(pk1.publicKey, 1, "node-1", "127.0.0.1", "192.168.1.101", 7001, 8001, 9001);
    let n2 = network.NodeInfo.withParameters(pk2.publicKey, 2, "node-2", "127.0.0.1", "192.168.1.101", 7002, 8002, 9002);
    let n3 = network.NodeInfo.withParameters(pk3.publicKey, 3, "node-3", "127.0.0.1", "192.168.1.101", 7003, 8003, 9003);
    assert(!nc.find(1));
    assert(!nc.find(2));
    assert(!nc.find(3));
    nc.addNode(n1);
    nc.addNode(n2);
    nc.addNode(n3);
    assert(nc.find(1));
    assert(nc.find(2));
    assert(nc.find(3));
    let n2c = nc.getInfo(2);
    assert(n2.number === n2c.number);
    assert(n2.name === n2c.name);
    assert(n2.publicKey.equals(n2c.publicKey));
    assert(!n1.publicKey.equals(n2c.publicKey));
    assert(n2.nodeAddress.host === n2c.nodeAddress.host);
    assert(n2.nodeAddress.port === n2c.nodeAddress.port);
    assert(n2.clientAddress.host === n2c.clientAddress.host);
    assert(n2.clientAddress.port === n2c.clientAddress.port);
    assert(n2.serverAddress.host === n2c.serverAddress.host);
    assert(n2.serverAddress.port === n2c.serverAddress.port);
});
