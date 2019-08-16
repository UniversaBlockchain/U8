import {expect, unit, assert, assertSilent} from 'test'
import {Ledger} from 'ledger'
import {udp} from 'network'
import * as trs from "timers";
import {HttpServer, HttpClient} from 'web'
import {MemoryUser1} from "research"
import * as tk from 'unit_tests/test_keys'
const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ScheduleExecutor = require("executorservice").ScheduleExecutor;
const t = require('tools.js');

const HTTP = true;
const CRYPT = true;
const UDP = true;
const TIMERS = true;
const PG = true;

const ITERATIONS = 10;
const NODES = 10;

const LOG = true;

/*unit.test("stress_test_3", async () => {
    let t0 = new Date().getTime();
    let c0 = 0;
    let sendCounter = 0;
    let readyCounter = 0;
    let privkey = await crypto.PrivateKey.generate(2048);
    let pubkey = privkey.publicKey;
    let body = t.randomString(10*1024);
    for (let k = 0; k < 1000; ++k) {
        let promises = [];
        for (let i = 0; i < 1000000; ++i) {
            ++sendCounter;
            promises.push(new Promise(async resolve => {
                //let res = await pubkey.verify(utf8Encode("data"), utf8Encode("signature"));
                //let res = await crypto.PrivateKey.generate(2048);
                //let res = await crypto.HashId.of(body);
                let res = await crypto.HashId.of_async(body);
                ++readyCounter;
                let dt = new Date().getTime() - t0;
                if (dt > 1000) {
                    console.log("rate = " + ((readyCounter - c0) * 1000 / dt).toFixed(0) +
                        ", readyCounter = " + readyCounter);
                    c0 = readyCounter;
                    t0 = new Date().getTime();
                }
                resolve(res);
            }));
            if (sendCounter - readyCounter > 2000)
                await sleep(10);
        }
        await Promise.all(promises);
        console.log("============ " + k + " ============");
    }
});*/

const recursion = 1000;
const iterations = 10000;

unit.test("async performance", async () => {
    let it = 0;
    let func = () => {
        //crypto.HashId.of_sync(t.randomString(10*1024));
        let t = 124190481948910843 * 4398240938209483;
        it++;
        if (it < recursion)
            func();
    };

    let async_func = async () => {
        //await crypto.HashId.of_async(t.randomString(10*1024));
        let t = 124190481948910843 * 4398240938209483;
        it++;
        if (it < recursion)
            await async_func();
    };

    let t0 = new Date().getTime();

    for (let i = 0; i < iterations; i++) {
        it = 0;
        func();
    }

    let dt = new Date().getTime() - t0;

    console.log("Sync: " + dt);

    t0 = new Date().getTime();

    for (let i = 0; i < iterations; i++) {
        it = 0;
        await async_func();
    }

    dt = new Date().getTime() - t0;

    console.log("Async: " + dt);
});

/*unit.test("stress_test", async () => {
    let ledgers = [];
    let udpAdapters = [];
    let httpServers = [];
    let httpClients = [];
    let httpSecClients = [];
    let timer_it = [];
    let sendCounter = 0;
    let receiveCounter = 0;

    let PG_init = async () => {
        for (let i = 0; i < NODES; i++) {
            ledgers[i] = new Ledger("host=localhost port=5432 dbname=unit_tests");
            await ledgers[i].init();
        }
    };

    let PG_run = async (num) => {
        for (let i = 0; i < ITERATIONS; i++) {
            if (LOG)
                console.log("PG iteration = " + i);

            await ledgers[num].countRecords();
        }
    };

    let PG_close = async () => {
        for (let i = 0; i < NODES; i++) {
            await ledgers[i].close();
            ledgers[i] = null;
        }
    };

    let UDP_init = async () => {
        let nc = new network.NetConfig();
        let pkArr = [];
        for (let i = 0; i < NODES; i++) {
            let pk = tk.TestKeys.getKey();
            let n = network.NodeInfo.withParameters(pk.publicKey, i+1, "node-"+i, "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001+i, 8001+i, 9001+i);
            nc.addNode(n);
            pkArr.push(pk);
        }

        for (let i = 0; i < NODES; i++) {
            udpAdapters[i] = new network.UDPAdapter(pkArr[i], i+1, nc);

            udpAdapters[i].setReceiveCallback(async (data, fromNode) => {
                if (utf8Decode(data) !== "answer")
                    await udpAdapters[i].send(fromNode.number, "answer");
            });
        }
    };

    let UDP_run = async (num, dest) => {
        for (let i = 0; i < ITERATIONS; i++) {
            if (LOG)
                console.log("UDP iteration = " + i);

            await udpAdapters[num].send(dest, "request");
        }
    };

    let UDP_close = async () => {
        for (let i = 0; i < NODES; i++) {
            await udpAdapters[i].close();
            udpAdapters[i] = null;
        }
    };

    let inside_block = async () => {
        for (let i = 0; i < NODES; i++) {
            if (UDP)
                await UDP_run(i, i+1);//(i < NODES - 1) ? i + 1 : 0);

            if (PG)
                await PG_run(i);
        }
    };

    let timer_block = async (num) => {
        let fire = null;
        let event = new Promise(resolve => fire = resolve);

        timer_it[num] = 0;
        let timer = null;
        let timerCallback = async () => {
            if (LOG)
                console.log("Timer iteration = " + timer_it[num]);

            await inside_block();

            timer_it[num]++;

            if (timer_it[num] < ITERATIONS)
                timer = trs.timeout(10, timerCallback);
            else
                fire();
        };
        timer = trs.timeout(10, timerCallback);
        await event;
    };

    let base_block = async (num) => {
        if (TIMERS)
            await timer_block(num);
        else
            await inside_block();
    };

    let HTTP_init = async () => {
        for (let i = 0; i < NODES; i++) {
            let httpServer = new network.HttpServer("0.0.0.0", 8080 + i, 1);
            let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
            let clientKey = await crypto.PrivateKey.generate(2048);

            httpServer.addEndpoint("/test", async (request) => {
                await base_block(i);

                request.setHeader("Content-Type", "text/html");
                return {rb: request.requestBody.length, rm: request.method};
            });

            let httpClient = new network.HttpClient("http://localhost:" + (8080 + i));

            if (CRYPT) {
                httpServer.initSecureProtocol(nodeKey);
                httpServer.addSecureEndpoint("sec", async (reqParams, clientPublicKey) => {
                    await base_block(ITERATIONS + i);

                    return {U: "12345"};
                });

                httpServer.startServer();

                let httpSecClient = new network.HttpClient("http://localhost:" + (8080 + i));

                await httpSecClient.start(clientKey, new crypto.PublicKey(nodeKey));

                httpSecClients[i] = httpSecClient;

            } else
                httpServer.startServer();

            httpServers[i] = httpServer;
            httpClients[i] = httpClient;
        }
    };

    let HTTP_run = async () => {
        for (let i = 0; i < NODES; i++) {
            let srv = 0;
            for (let it = 0; it < ITERATIONS; it++) {
                sendCounter++;
                httpClients[i].sendGetRequestUrl("http://localhost:" + (8080 + srv) + "/test?a=73&b=1000000", (respCode, body) => {
                    if (LOG)
                        console.log("HTTP iteration = " + receiveCounter);
                    ++receiveCounter;
                });

                if (CRYPT)
                    sendCounter++;
                    httpSecClients[i].command("sec", {}, async (resp) => {
                        if (LOG)
                            console.log("HTTP secure iteration = " + receiveCounter);
                        ++receiveCounter;
                    }, error => {
                        console.error("exception: " + error);
                    });

                srv++;
                if (srv >= NODES)
                    srv = 0;

                if (receiveCounter + 1000 < sendCounter)
                    await sleep(10);
            }
        }

        while (receiveCounter < sendCounter)
            await sleep(10);
    };

    let HTTP_close = async () => {
        for (let i = 0; i < NODES; i++) {
            await httpClients[i].stop();
            await httpServers[i].stopServer();
        }
    };

    //init
    if (LOG)
        console.log("Initialization...");
    if (PG)
        await PG_init();
    if (UDP)
        await UDP_init();
    if (HTTP)
        await HTTP_init();

    //run
    if (LOG)
        console.log("Running...");
    if (HTTP)
        await HTTP_run();
    else
        await base_block(0);

    //close
    if (LOG)
        console.log("Closing...");
    if (PG)
        await PG_close();
    if (UDP)
        await UDP_close();
    if (HTTP)
        await HTTP_close();
});*/

/*unit.test("stress_test_with_rates", async () => {

    const TEST_DURATION = 120*1000;

    const NODE_COUNT    = 4;
    const ENABLE_HTTP   = true;
    const ENABLE_HTTPS  = true;
    const ENABLE_UDP    = true;
    const ENABLE_TIMERS = true;
    const ENABLE_LEDGER = true;

    const UDP_SEND_SPEED     = 300;
    const HTTP_SEND_SPEED    = 100;
    const HTTPS_SEND_SPEED   = 150;
    const TIMERS_SEND_SPEED  = 1000;
    const LEDGER_SEND_SPEED  = 1000;

    const ASYNC_HEAVY_WORK         = true; // calls from each callback
    const UDP_ASYNC_HEAVY_WORK     = true * ASYNC_HEAVY_WORK;
    const HTTP_ASYNC_HEAVY_WORK    = true * ASYNC_HEAVY_WORK;
    const HTTPS_ASYNC_HEAVY_WORK   = true * ASYNC_HEAVY_WORK;
    const TIMERS_ASYNC_HEAVY_WORK  = true * ASYNC_HEAVY_WORK;
    const LEDGER_ASYNC_HEAVY_WORK  = true * ASYNC_HEAVY_WORK;

    let udpRate         = new t.RateCounter("       udp");
    let httpRate        = new t.RateCounter("      http");
    let httpsRate       = new t.RateCounter("     https");
    let timersRate      = new t.RateCounter("    timers");
    let ledgerRate      = new t.RateCounter("    ledger");
    let heavyWorkRate   = new t.RateCounter("heavy work");

    let asyncHeavyWork_key = await crypto.PrivateKey.generate(2048);
    let asyncHeavyWork = async () => {
        let data = t.randomString(64);
        let fakeSig = t.randomString(64);
        let sig = await asyncHeavyWork_key.publicKey.verify(data, fakeSig.bytes);
        heavyWorkRate.inc();
    };

    console.log();
    console.log("TEST_DURATION: " + (TEST_DURATION/1000) + " sec");

    let udpAdapters = [];
    let httpServers = [];
    let httpClients = [];
    let ledgers     = [];

    let udp_sendCounter = 0;
    let udp_receiveCounter = 0;
    let udp_init = async () => {
        let nc = new network.NetConfig();
        let pkArr = [];
        for (let i = 0; i < NODE_COUNT; i++) {
            let pk = tk.TestKeys.getKey();
            let n = network.NodeInfo.withParameters(pk.publicKey, i, "node-"+i, "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001+i, 8001+i, 9001+i);
            nc.addNode(n);
            pkArr.push(pk);
        }

        for (let i = 0; i < NODE_COUNT; ++i) {
            udpAdapters[i] = new network.UDPAdapter(pkArr[i], i, nc);

            udpAdapters[i].setReceiveCallback(async (data, fromNode) => {
                udpRate.inc();
                if (UDP_ASYNC_HEAVY_WORK)
                    await asyncHeavyWork();
                if (utf8Decode(data) === "request") {
                    ++udp_receiveCounter;
                    await udpAdapters[i].send(fromNode.number, "answer");
                }
            });
        }
    };

    let udp_pulse = async () => {
        return new Promise(resolve => {
            while (udp_sendCounter - udp_receiveCounter < UDP_SEND_SPEED) {
                let i = udp_sendCounter % NODE_COUNT;
                let j = (udp_sendCounter + 1) % NODE_COUNT;
                udpAdapters[i].send(j, "request");
                ++udp_sendCounter;
            }
            resolve();
        });
    };

    let udp_close = async () => {
        for (let i = 0; i < NODE_COUNT; i++) {
            await udpAdapters[i].close();
            udpAdapters[i] = null;
        }
    };

    let http_sendCounter = 0;
    let http_receiveCounter = 0;
    let https_sendCounter = 0;
    let https_receiveCounter = 0;
    let http_init = async () => {
        for (let i = 0; i < NODE_COUNT; i++) {
            let httpServer = new network.HttpServer("0.0.0.0", 8080 + i, 1);
            let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
            let clientKey = tk.TestKeys.getKey();

            httpServer.addEndpoint("/test", async (request) => {
                request.setHeader("Content-Type", "text/html");
                if (HTTP_ASYNC_HEAVY_WORK)
                    await asyncHeavyWork();
                httpRate.inc();
                return {rb: request.requestBody.length, rm: request.method};
            });

            let httpClient = new network.HttpClient("http://localhost:" + (8080 + i));


            if (ENABLE_HTTPS) {
                httpServer.initSecureProtocol(nodeKey);
                httpServer.addSecureEndpoint("sec", async (reqParams, clientPublicKey) => {
                    if (HTTPS_ASYNC_HEAVY_WORK)
                        await asyncHeavyWork();
                    httpsRate.inc();
                    return {U: "12345"};
                });

                httpServer.startServer();

                await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));
            } else {
                httpServer.startServer();
            }

            httpServers[i] = httpServer;
            httpClients[i] = httpClient;
        }
    };

    let http_pulse = async () => {
        return new Promise(resolve => {
            while (http_sendCounter - http_receiveCounter < HTTP_SEND_SPEED) {
                let i = http_sendCounter % NODE_COUNT;
                let j = (http_sendCounter + 1) % NODE_COUNT;

                httpClients[i].sendGetRequestUrl("http://localhost:" + (8080 + j) + "/test?a=73&b=1000000", async (respCode, body) => {
                    ++http_receiveCounter;
                    if (HTTP_ASYNC_HEAVY_WORK)
                        await asyncHeavyWork();
                    httpRate.inc();
                });

                ++http_sendCounter;
            }
            resolve();
        });
    };

    let https_pulse = async () => {
        return new Promise(resolve => {
            while (https_sendCounter - https_receiveCounter < HTTPS_SEND_SPEED) {
                let i = https_sendCounter % NODE_COUNT;
                httpClients[i].command("sec", {}, async (resp) => {
                    ++https_receiveCounter;
                    if (HTTPS_ASYNC_HEAVY_WORK)
                        await asyncHeavyWork();
                    httpsRate.inc();
                }, error => {
                    console.error("exception: " + error);
                });
                ++https_sendCounter;
            }
            resolve();
        });
    };

    let http_close = async () => {
        for (let i = 0; i < NODE_COUNT; i++) {
            await httpClients[i].stop();
            await httpServers[i].stopServer();
        }
    };

    let timers_sendCounter = 0;
    let timers_receiveCounter = 0;
    let timers_pulse = async () => {
        return new Promise(resolve => {
            while (timers_sendCounter - timers_receiveCounter < TIMERS_SEND_SPEED) {
                ++timers_sendCounter;
                new ScheduleExecutor(async () => {
                    if (TIMERS_ASYNC_HEAVY_WORK)
                        await asyncHeavyWork();
                    timersRate.inc();
                    ++timers_receiveCounter;
                }, timers_sendCounter % 20).run();
            }
            resolve();
        });
    };

    let ledger_sendCounter = 0;
    let ledger_receiveCounter = 0;
    let ledger_init = async () => {
        for (let i = 0; i < NODE_COUNT; ++i) {
            ledgers[i] = new Ledger("host=localhost port=5432 dbname=unit_tests");
            await ledgers[i].init();
        }
    };

    let ledger_pulse = async () => {
        return new Promise(resolve => {
            while (ledger_sendCounter - ledger_receiveCounter < LEDGER_SEND_SPEED) {
                ++ledger_sendCounter;
                let i = ledger_sendCounter % NODE_COUNT;
                ledgers[i].dbPool_.withConnection(async con => {
                    if (LEDGER_ASYNC_HEAVY_WORK)
                        await asyncHeavyWork();
                    con.executeQuery(
                        async qr => {
                            if (LEDGER_ASYNC_HEAVY_WORK)
                                await asyncHeavyWork();
                            ledgerRate.inc();
                            con.release();
                            ++ledger_receiveCounter;
                        },
                        er => {
                            console.error("ledger_pulse error: " + er);
                        },
                        "SELECT COUNT(*) FROM ledger"
                    )
                });
            }
            resolve();
        });
    };

    let ledger_close = async () => {
        for (let i = 0; i < NODE_COUNT; i++) {
            await ledgers[i].close();
            ledgers[i] = null;
        }
    };

    // init
    console.log("\ninit...");
    if (ENABLE_UDP)
        await udp_init();
    if (ENABLE_HTTP || ENABLE_HTTPS)
        await http_init();
    if (ENABLE_LEDGER)
        await ledger_init();

    let showCounters = new ExecutorWithFixedPeriod(async () => {
        console.log();
        let dt = new Date().getTime() - startTime;
        let progress = Math.min(100, dt / TEST_DURATION * 100);
        console.log("   === progress: " + progress.toFixed(2) + "%, time elapsed: " + (dt/60000).toFixed(0) + " min ===");
        udpRate.show();
        httpRate.show();
        httpsRate.show();
        timersRate.show();
        ledgerRate.show();
        heavyWorkRate.show();
    }, 2000);
    showCounters.run();

    // run
    console.log("\nrun test...");
    let now = new Date().getTime();
    let startTime = now;
    while (now - startTime < TEST_DURATION) {
        let promises = [];
        if (ENABLE_UDP)
            promises.push(udp_pulse());
        if (ENABLE_HTTP)
            promises.push(http_pulse());
        if (ENABLE_HTTPS)
            promises.push(https_pulse());
        if (ENABLE_TIMERS)
            promises.push(timers_pulse());
        if (ENABLE_LEDGER)
            promises.push(ledger_pulse());
        await Promise.all(promises);
        now = new Date().getTime();
        await sleep(10);
    }

    showCounters.cancel();

    // close
    console.log("\nclose...");
    let stopTime = new Date().getTime();
    await sleep(1000);
    if (ENABLE_UDP)
        await udp_close();
    if (ENABLE_HTTP || ENABLE_HTTPS)
        await http_close();
    if (ENABLE_LEDGER)
        await ledger_close();

    console.log("\nDONE, total time: " + (stopTime-startTime)/1000 + " sec");
});*/
