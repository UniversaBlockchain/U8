import {expect, unit, assert} from 'test'
import {Ledger} from 'ledger'
import {udp} from 'network'
import * as trs from "timers";
import {HttpServer, HttpClient} from 'web'
import * as tk from 'unit_tests/test_keys'

const HTTP = true;
const CRYPT = true;
const UDP = true;
const TIMERS = true;
const PG = true;

const ITERATIONS = 10;
const NODES = 10;

const LOG = true;

unit.test("stress_test", async () => {
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
            let n = network.NodeInfo.withParameters(pk.publicKey, i+1, "node-"+1, "127.0.0.1", "0:0:0:0:0:0:0:1", "192.168.1.101", 7001+i, 8001+i, 9001+i);
            nc.addNode(n);
            pkArr.push(pk);
        }

        for (let i = 0; i < NODES; i++) {
            udpAdapters[i] = new network.UDPAdapter(pkArr[i], i+1, nc);

            udpAdapters[i].setReceiveCallback(async (data, fromNode) => {
                if (data !== "answer")
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
            let httpServer = new network.HttpServer("0.0.0.0", 8080 + i, 1, 64);
            let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
            let clientKey = await crypto.PrivateKey.generate(2048);

            httpServer.addEndpoint("/test", async (request) => {
                await base_block(i);

                request.setHeader("Content-Type", "text/html");
                return {rb: request.requestBody.length, rm: request.method};
            });

            let httpClient = new network.HttpClient("http://localhost:" + (8080 + i), 1, 64);

            if (CRYPT) {
                httpServer.initSecureProtocol(nodeKey);
                httpServer.addSecureEndpoint("sec", async (reqParams, clientPublicKey) => {
                    await base_block(ITERATIONS + i);

                    return {U: "12345"};
                });

                httpServer.startServer();

                let httpSecClient = new network.HttpClient("http://localhost:" + (8080 + i), 1, 64);

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
});