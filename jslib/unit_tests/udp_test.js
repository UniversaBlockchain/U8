import {expect, unit, assert, assertSilent} from 'test'
import {NodeInfo} from 'udp_adapter'

unit.test("hello network", async () => {
    console.log();
    let newKey = await crypto.PrivateKey.generate(2048);
    console.log("newKey: " + newKey.publicKey.shortAddress);
    let t0 = new Date().getTime();
    let i0 = 0;
    let sum = 0;
    let n = new network.NodeInfo(newKey.publicKey, 33, "node-33", "127.0.0.1", "192.168.1.101", 7007, 8008, 9009);
    //for (let i = 0; i < 1000000000; ++i) {
    for (let i = 0; i < 1000; ++i) {
        //let n = new network.NodeInfo(newKey.publicKey, 1, 2, 3, 4, 5, 6, 7);
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
    let n = new network.NodeInfo(newKey.publicKey, 33, "node-33", "127.0.0.1", "192.168.1.101", 7007, 8008, 9009);
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
