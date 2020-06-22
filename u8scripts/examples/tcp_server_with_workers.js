/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, consoleWrapper, farcallWrapper} from 'worker'
import {tcp} from "network";

let tcpWorkerSrc = () => {

    const TcpConnection = require("network").TcpConnection;

    wrkInner.export.accept = async (args, kwargs) => {

        /**
         *  client should send to this server many packages, each strictly 24 bytes length
         *  example: ping00000000000000000142
         *  server will answers with corresponding pong00000000000000000142
         *
         *  look for client in test_asyncio.cpp, named "asyncio_tcp_bench_client"
         */

        let connectionProcessor = async (connection) => {
            try {
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
                        let packet = bv.slice(pos, pos + 24);
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
            } catch (e) {
                console.log("error in worker connectionProcessor: " + e);
            }
        };

        try {
            let connectionHandle = new IOTCP();
            let result = connectionHandle._accept_from_global_id(args[0]);
            const chunkSize = 1024;
            let conn = new TcpConnection(connectionHandle, chunkSize);
            connectionProcessor(conn);
            console.log("accept in worker... ok (workerId=" + args[1] + ")");
        } catch (e) {
            console.log("error in worker: " + e);
        }
    }

};

class SocketWorker {
    constructor() {
        this.worker = null;
    }

    async release() {
        await this.worker.release();
    }

    static async start() {

        let tcpWorkerCode = tcpWorkerSrc.toString();
        tcpWorkerCode = tcpWorkerCode.substr(tcpWorkerCode.indexOf('{') + 1);
        tcpWorkerCode = tcpWorkerCode.substr(0, tcpWorkerCode.lastIndexOf('}'));

        let res = new SocketWorker();
        res.worker = await getWorker(0, consoleWrapper + farcallWrapper + tcpWorkerCode);
        res.worker.startFarcallCallbacks();
        res.worker.export["__worker_bios_print"] = (args, kwargs) => {
            let out = args[0] === true ? console.error : console.logPut;
            out(...args[1], args[2]);
        };
        return res;
    }

    accept(serverSocketGlobalId, workerId) {
        return new Promise(resolve => this.worker.farcall("accept", [serverSocketGlobalId, workerId], {}, ans => {
            resolve(ans);
        }));
    }
}

async function main(args) {
    let server = tcp.listen({port: 9990});

    let workerPool = [];
    for (let i = 0; i < 8; ++i)
        workerPool.push(await SocketWorker.start());

    server.acceptWithWorker(workerPool, (error) => {
        unit.fail("accept failed: " + error);
    });

    console.log("server has started, workers count = " + workerPool.length);

    let secondsToWait = 600;
    console.log("wait for " + secondsToWait + " seconds...");
    await sleep(secondsToWait * 1000);

    await server.close();
    console.log("server has stopped");
}
