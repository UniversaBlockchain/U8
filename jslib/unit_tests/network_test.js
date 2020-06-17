/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, assert, assertSilent, unit} from 'test'
import {tcp, tls, udp} from 'network'
import {now} from 'timers'
import {getWorker, consoleWrapper, farcallWrapper} from 'worker'

async function reportErrors(block) {
    try {
        return await block()
    } catch (e) {
        console.error(e);
    }
}

unit.test("multi tcp", async () => {

    for (let i = 0; i < 10; i++)
    {
        let server = tcp.listen({port: 23102});
        let serverReads;

        let connectionProcessor = async (connection) => {
            await reportErrors(async () => {
                serverReads = await connection.input.readLine();
                await connection.output.write("hello!\n");
                await connection.close();
            });
        };

        server.accept(connectionProcessor, (error) => {
            unit.fail("accept failed: " + error);
        });

        let conn = await tcp.connect({host: "127.0.0.1", port: 23102});
        await conn.output.write("foobar\n");
        let ss = chomp(await conn.input.allAsString());
        expect.equal(ss, "hello!");
        expect.equal(serverReads, "foobar");
        await conn.close();
        await server.close();
    }
});

unit.test("multi tls", async () => {

    for (let i = 0; i < 10; i++)
    {
        let server = tls.listen({port: 24103, certFilePath: "../test/server-cert.pem", keyFilePath: "../test/server-key.pem"});
        let serverReads;

        let connectionProcessor = async (connection) => {
            await reportErrors(async () => {
                serverReads = await connection.input.readLine();
                await connection.output.write("hello!\n");
                await connection.close();
            });
        };

        server.accept(connectionProcessor, (error) => {
            unit.fail("accept failed: " + error);
        });

        let conn = await tls.connect({host: "127.0.0.1", port: 24103, certFilePath: "../test/server-cert.pem", keyFilePath: "../test/server-key.pem"});

        await conn.output.write("foobar\n");
        let ss = chomp(await conn.input.allAsString());
        expect.equal(ss, "hello!");
        expect.equal(serverReads, "foobar");
        await conn.close();
        await server.close();
    }
});

unit.test("simple udp", async () => {

    let sock1 = udp.open({port: 18157}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18158}, (error) => {
        unit.fail("open failed: " + error);
    });

    sock1.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            expect.equal(data, "qwerty");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18158, "check port");

            await sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    sock2.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            expect.equal(data, "123");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18157, "check port");

            await sock2.send("qwerty", {port: 18157});

            await sock2.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    await sock1.send("123", {port: 18158});
});

unit.test("multi udp", async () => {

    let sock1 = udp.open({port: 18107}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18108}, (error) => {
        unit.fail("open failed: " + error);
    });

    let packets = 0;

    sock1.recv(100, async (data, IP, port) => {
        await reportErrors(async () => {
            assert(((data === "qwerty") || (data === "1234567")), "check data");
            assert(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip");
            assert(port === 18108, "check port");

            packets++;
            if (packets === 2)
                await sock1.close();
        });
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    await sock2.send("qwerty", {port: 18107});
    await sock2.send("1234567", {port: 18107});

    let t0 = now();
    while(true) {
        await sleep(40);
        if (packets >= 2)
            break;
        if (now() - t0 > 1000)
            assert(false, "timeout");
    }
    assert(packets===2, "check received packets count");

    await sock2.close();
});

unit.test("multi udp 100", async () => {

    let sock1 = udp.open({port: 18107}, (error) => {
        unit.fail("open failed: " + error);
    });

    let sock2 = udp.open({port: 18108}, (error) => {
        unit.fail("open failed: " + error);
    });

    let packets = 0;
    let promises = [];

    sock1.recv(100, async (data, IP, port) => {
        let p = new Promise(resolve => {
            packets++;
            assertSilent(((data === "qwerty") || (data === "1234567")), "check data");
            assertSilent(((IP === "127.0.0.1") || (IP === "0.0.0.0")), "check ip "+packets+": "+IP);
            assertSilent(port === 18108, "check port");
            resolve();
        });
        promises.push(p);
    }, (error) => {
        unit.fail("recv failed: " + error);
    });

    let t0 = now();
    let count_to_send = 100;
    for (var i = 0; i < count_to_send; ++i) {
        await sock2.send("qwerty", {port: 18107});
    }

    while (promises.length < count_to_send)
        await sleep(10);
    await Promise.all(promises);

    let dt = now() - t0;
    //console.log("rate: " + (packets/dt*1000).toFixed(2) + " packets per second");
    assert(packets===count_to_send, "check received packets count");

    await sock1.close();
    await sock2.close();
});

unit.test("udp reopen", async () => {
    for (var i = 0; i < 100; ++i) {
        let sock1 = udp.open({port: 18107}, (error) => {
            unit.fail("open failed (i="+i+"): " + error);
        });
        await sock1.close();
    }
});

unit.test("tcp bench server", async () => {
    let server = tcp.listen({port: 9990});

    /**
     *  client should send to server many packages, each strictly 24 bytes length
     *  example: ping00000000000000000142
     *  server will answers with corresponding pong00000000000000000142
     *
     *  look for client in test_asyncio.cpp, named "asyncio_tcp_bench_client"
     */

    let connectionProcessor = async (connection) => {
        let readBuf = new Uint8Array(0);
        while (true) {
            let r = await connection.input.read(256);
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

    await sleep(200);

    await server.close();
});

unit.test("tcp workers bench server", async () => {

    class SocketWorker {
        constructor() {this.worker = null;}
        async release() {await this.worker.release();}
        static async start() {
            let res = new SocketWorker();
            res.worker = await getWorker(0, consoleWrapper+farcallWrapper+`
                
            const TcpConnection = require("network").TcpConnection;
                
            wrkInner.export.accept = async (args, kwargs) => {
            
                let connectionProcessor = async (connection) => {
                    let readBuf = new Uint8Array(0);
                    while (true) {
                        let r = await connection.input.read(256);
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
            `);
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

    let server = tcp.listen({port: 9990});

    let workers = [];
    for (let i = 0; i < 8; ++i)
        workers.push(await SocketWorker.start());
    server.acceptWithWorker(workers, (error) => {
        unit.fail("accept failed: " + error);
    });

    await sleep(200);

    await server.close();
});
