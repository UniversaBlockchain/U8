/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
import {NodeInfo} from 'web'
import * as tk from 'unit_tests/test_keys'

unit.test("hello network", async () => {
    //console.log();
    let t0 = new Date().getTime();
    let i0 = 0;

    let nc = new network.NetConfig();
    let pk1 = tk.TestKeys.getKey();
    let pk2 = tk.TestKeys.getKey();
    let n1 = network.NodeInfo.withParameters(pk1.publicKey, 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001, 8001, 9001);
    let n2 = network.NodeInfo.withParameters(pk2.publicKey, 2, "node-2", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7002, 8002, 9002);
    nc.addNode(n1);
    nc.addNode(n2);
    let udp1 = new network.UDPAdapter(pk1, 1, nc);
    let udp2 = new network.UDPAdapter(pk2, 2, nc);

    let receiveCounter = 0;
    udp1.setReceiveCallback((packet, fromNode)=>{
        ++receiveCounter;
    });
    udp2.setReceiveCallback((packet, fromNode)=>{
        ++receiveCounter;
    });

    //let totalCount = 100000000;
    let totalCount = 100;
    for (let i = 0; i < totalCount; ++i) {

        udp1.send(2, "payload1");
        udp2.send(1, "payload2");

        while (receiveCounter+1000 < 2*i)
            await sleep(10);

        if (new Date().getTime() - t0 >= 1000) {
            console.log("receiveCounter = " + receiveCounter + ", speed = " + (receiveCounter - i0));
            t0 = new Date().getTime();
            i0 = receiveCounter;
            //gc();
        }
    }

    while (receiveCounter < 2*totalCount)
        await sleep(10);
    udp1.close();
    udp2.close();
});

unit.test("network.SocketAddress", async () => {
    let s = new network.SocketAddress("localhost", 3333);
    assert(s.host === "localhost");
    assert(s.port === 3333);
});

unit.test("network.NodeInfo", async () => {
    let newKey = await crypto.PrivateKey.generate(2048);
    let n = network.NodeInfo.withParameters(newKey.publicKey, 33, "node-33", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7007, 8008, 9009);
    assert(n.number === 33);
    assert(n.name === "node-33");
    assert(n.publicHost === "192.168.1.101");
    assert(n.publicKey.equals(newKey.publicKey));
    assert(n.nodeAddress.host === "127.0.0.1");
    assert(n.nodeAddress.port === 7007);
    assert(n.clientAddress.host === "192.168.1.101");
    assert(n.clientAddress.port === 8008);
    assert(n.publicPort === 9009);
});

unit.test("network.NetConfig", async () => {
    let nc = new network.NetConfig();
    let pk1 = tk.TestKeys.getKey();
    let pk2 = tk.TestKeys.getKey();
    let pk3 = tk.TestKeys.getKey();
    let n1 = network.NodeInfo.withParameters(pk1.publicKey, 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001, 8001, 9001);
    let n2 = network.NodeInfo.withParameters(pk2.publicKey, 2, "node-2", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7002, 8002, 9002);
    let n3 = network.NodeInfo.withParameters(pk3.publicKey, 3, "node-3", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7003, 8003, 9003);
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
    assert(n2.publicPort === n2c.publicPort);
    let list = nc.toList();
    assert(list.length === 3);
    let numbers = [1,2,3];
    let ports = [n1.publicPort, n2.publicPort, n3.publicPort];
    assert(numbers.includes(list[0].number));
    assert(numbers.includes(list[1].number));
    assert(numbers.includes(list[2].number));
    assert(ports.includes(list[0].publicPort));
    assert(ports.includes(list[1].publicPort));
    assert(ports.includes(list[2].publicPort));
});

unit.test("network.UDPAdapter", async () => {
    let nc = new network.NetConfig();
    let pk1 = tk.TestKeys.getKey();
    let pk2 = tk.TestKeys.getKey();
    let n1 = network.NodeInfo.withParameters(pk1.publicKey, 1, "node-1", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001, 8001, 9001);
    let n2 = network.NodeInfo.withParameters(pk2.publicKey, 2, "node-2", "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7002, 8002, 9002);
    nc.addNode(n1);
    nc.addNode(n2);
    let udp1 = new network.UDPAdapter(pk1, 1, nc);
    let udp2 = new network.UDPAdapter(pk2, 2, nc);

    let receiveCounter = 0;
    udp1.setReceiveCallback((packet, fromNode)=>{
        //console.log("udp1 receive from "+fromNode.number+": " + utf8Decode(packet));
        assert(utf8Decode(packet) === "payload2");
        assert(fromNode.number === 2);
        ++receiveCounter;
    });
    udp2.setReceiveCallback((packet, fromNode)=>{
        //console.log("udp2 receive from "+fromNode.number+": " + utf8Decode(packet));
        assert(utf8Decode(packet) === "payload1");
        assert(fromNode.number === 1);
        ++receiveCounter;
    });

    udp1.send(2, "payload1");
    udp2.send(1, "payload2");

    while (receiveCounter < 2)
        await sleep(10);
    udp1.close();
    udp2.close();
});
