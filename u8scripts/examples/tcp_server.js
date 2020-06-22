/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {tcp} from "network";

async function main(args) {

    let server = tcp.listen({port: 9990});

    /**
     *  client should send to this server many packages, each strictly 24 bytes length
     *  example: ping00000000000000000142
     *  server will answers with corresponding pong00000000000000000142
     *
     *  look for client in test_asyncio.cpp, named "asyncio_tcp_bench_client"
     */

    let connectionProcessor = async (connection) => {
        let readBuf = new Uint8Array(0);
        while (true) {
            let r = await connection.input.read_some();
            if (r.byteLength === 0) {
                await connection.close();
                break;
            }
            let bv = new Uint8Array(readBuf.byteLength + r.byteLength);
            bv.set(readBuf);
            bv.set(r, readBuf.byteLength);
            let sz = bv.byteLength;
            let pos = 0;
            let promises = [];
            while (sz - pos >= 24) {
                let packet = bv.slice(pos, pos+24);
                pos += 24;
                // console.log("rcv: " + utf8Decode(packet));
                packet[1] = 'o'.charCodeAt(0);
                promises.push(connection.output.write(packet));
            }
            await Promise.all(promises);
            if (pos !== sz) {
                readBuf = bv.slice(pos);
            } else {
                readBuf = new Uint8Array(0);
            }
        }
    };

    server.accept(connectionProcessor, (error) => {
        unit.fail("accept failed: " + error);
    });

    console.log("server has started");

    let secondsToWait = 600;
    console.log("wait for " + secondsToWait + " seconds...");
    await sleep(secondsToWait * 1000);

    await server.close();
    console.log("server has stopped");
}
