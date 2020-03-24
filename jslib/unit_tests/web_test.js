/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {expect, unit, assert, assertSilent} from 'test'
import {HttpServer, DnsServer, DnsRRType} from 'web'
import * as tk from 'unit_tests/test_keys'
const Boss = require('boss.js');
const t = require('tools.js');
const ItemResult = require('itemresult.js');

unit.test("hello web", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 1);
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    httpServer.initSecureProtocol(nodeKey);
    let counter = 0;
    httpServer.addRawEndpoint("/testPage", async (request) => {
        //console.log("getEndpoint: " + request.endpoint);
        //console.log("method: " + request.method);
        ++counter;
        let a = request.queryParamsMap.get('a');
        let b = request.queryParamsMap.get('b');
        await sleep(1);
        request.setHeader("Content-Type", "text/html");
        //console.log("queryString: " + request.queryString);
        request.setAnswerBody("httpServer: on /testPage counter="+(a*b+counter));
        request.sendAnswer();
    });
    httpServer.addRawEndpoint("/testPage2", (request) => {
        request.setStatusCode(201);
        request.setHeader("header1", "header_value_1");
        request.setHeader("header2", "header_value_2");
        request.setAnswerBody("httpServer: on /testPage2 some text");
        request.sendAnswer();
    });
    httpServer.addEndpoint("/ping", async (request) => {
        console.log("path: " + request.path);
        request.setHeader("Content-Type", "text/html");
        await sleep(1000);
        //return {"ping": "pong", "val": some_undefined_var_for_exception_throwing};
        return {"ping": "pong"};
    });
    httpServer.addEndpoint("/connect1", async (request) => {
        request.setHeader("Content-Type", "text/html");
        console.log("js /connect");
        console.log("js /connect method: " + request.method);
        console.log("js /connect requestBody: " + await Boss.load(request.requestBody));
        return {"ping": "pong"};
    });
    let unsRateDbg = 333;
    httpServer.addSecureEndpoint("unsRate", async (reqParams, clientPublicKey) => {
        // console.log(JSON.stringify(reqParams));
        // console.log(btoa(clientPublicKey.packed));
        unsRateDbg += 1;
        await sleep(1);
        return {U: unsRateDbg};
    });
    httpServer.startServer();

    let countToSend = 2000;
    //countToSend = 200000000;
    let receiveCounter = 0;

    let httpClient = new network.HttpClient("http://localhost:8080");
    await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

    let t00 = new Date().getTime();
    let t0 = new Date().getTime();
    let counter0 = 0;
    for (let i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("/testPage?a=73&b=1000000", (respCode, body) => {
            //console.log("[" + respCode + "]: " + utf8Decode(body));
            ++receiveCounter;
            let dt = new Date().getTime() - t0;
            if (dt >= 1000) {
                let rps = ((receiveCounter - counter0)*1000/dt).toFixed(0);
                t0 = new Date().getTime();
                counter0 = receiveCounter;
                console.log("receiveCounter=" + receiveCounter + ", rps=" + rps);
            }
        });
        if (receiveCounter+1000 < i)
            await sleep(10);
    }

    while (receiveCounter < countToSend) {
        await sleep(10);
    }
    let dt = new Date().getTime() - t00;
    let rps = (receiveCounter*1000/dt).toFixed(0);
    console.logPut(" rps=" + rps + " ");
    assert(receiveCounter == countToSend);

    await httpClient.stop();
    await httpServer.stopServer();
});

unit.test("http secure endpoints", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 1);
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    // console.log("clientKey: " + btoa(new crypto.PublicKey(clientKey).fingerprints));
    httpServer.initSecureProtocol(nodeKey);
    let counter = 0;
    let unsRateDbg = 333;
    httpServer.addSecureEndpoint("unsRate", async (reqParams, clientPublicKey) => {
        // console.log(JSON.stringify(reqParams));
        // console.log(btoa(clientPublicKey.fingerprints));
        unsRateDbg += 1;
        await sleep(1);
        return {U: ""+unsRateDbg};
    });
    httpServer.startServer();

    let countToSend = 2000;
    //countToSend = 200000000;
    let receiveCounter = 0;

    let httpClient = new network.HttpClient("http://localhost:8080");
    //let httpClient = new network.HttpClient("http://192.168.1.146:8080");
    await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

    let t00 = new Date().getTime();
    let t0 = new Date().getTime();
    let counter0 = 0;
    for (let i = 0; i < countToSend; ++i) {
        await httpClient.command("unsRate", {}, async (resp) => {
            //console.log(JSON.stringify(resp));
            ++receiveCounter;
            await sleep(1);
            let dt = new Date().getTime() - t0;
            if (dt >= 1000) {
                let rps = ((receiveCounter - counter0)*1000/dt).toFixed(0);
                t0 = new Date().getTime();
                counter0 = receiveCounter;
                console.log("receiveCounter=" + receiveCounter + ", rps=" + rps);
            }
        }, error => {
            console.log("exception: " + error);
        });
        if (receiveCounter+1000 < i)
            await sleep(10);
    }

    while (receiveCounter < countToSend) {
        await sleep(10);
    }
    let dt = new Date().getTime() - t00;
    let rps = (receiveCounter*1000/dt).toFixed(0);
    console.logPut(" rps=" + rps + " ");
    assert(receiveCounter == countToSend);

    await httpClient.stop();
    await httpServer.stopServer();
});



unit.test("big payload", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 1);
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    // console.log("clientKey: " + btoa(new crypto.PublicKey(clientKey).fingerprints));
    httpServer.initSecureProtocol(nodeKey);
    let counter = 0;
    let unsRateDbg = 333;
    httpServer.addSecureEndpoint("testEndpoint", async (reqParams, clientPublicKey) => {
        return {hash: crypto.HashId.of(reqParams.testData)};
    });
    httpServer.startServer();

    let httpClient = new network.HttpClient("http://localhost:8080");
    await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

    let testData = t.randomBytes(10000);

    let hashOk = null;
    await httpClient.command("testEndpoint", {testData: testData}, async (resp) => {
        hashOk = t.valuesEqual(resp.hash,crypto.HashId.of(testData));
    }, error => {
        console.log("exception: " + error);
    });

    while(hashOk == null) {
        await sleep(50);
    }

    console.logPut("hash ok: " + hashOk);
    assert(hashOk);

    await httpClient.stop();
    await httpServer.stopServer();
});

unit.test("http test multipart", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 1);
    httpServer.addEndpoint("/method1", (request) => {
        request.setHeader("Content-Type", "text/html");
        return {"ans": "answer from /method1"};
    });

    httpServer.addEndpoint("/method2", (request) => {
        let a = utf8Decode(request.multipartParams.a);
        let b = utf8Decode(request.multipartParams.b);
        let file1 = utf8Decode(request.multipartParams.file1);
        let file2 = utf8Decode(request.multipartParams.file2);
        request.setHeader("Content-Type", "text/html");
        return {"ans": a+b+file1+file2};
    });

    httpServer.startServer();

    let url = "http://localhost:8080";
    let httpClient = new network.HttpClient("");

    let resolver;
    let promise = new Promise(resolve => {resolver = resolve;});
    httpClient.sendGetRequestUrl(url+"/method1", (respCode, body) => {
        //console.log("method1 answer: [" + respCode + "]: " + JSON.stringify(Boss.load(body)));
        resolver();
    });
    await promise;

    promise = new Promise(resolve => {resolver = resolve;});
    let aValueData = 11;
    let bValueData = "bbb";
    let file1data = utf8Encode("1234567");
    let file2data = utf8Encode(t.randomString(10));

    httpClient.sendMultipartRequestUrl(url+"/method2", "POST", {
        a: aValueData,
        b: bValueData
    }, {
        file1: file1data,
        file2: file2data
    }, async (respCode, body) => {
        //console.log("method2 answer: [" + respCode + "]: " + JSON.stringify(Boss.load(body)));
        assert((await Boss.load(body)).response.ans === "11bbb1234567" + utf8Decode(file2data));
        resolver();
    });
    await promise;

    await httpClient.stop();
    await httpServer.stopServer();
});

unit.test("http recreate server", async () => {
    let foo = async () => {
        let httpServer = new network.HttpServer("0.0.0.0", 8080, 1);
        let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
        httpServer.initSecureProtocol(nodeKey);
        httpServer.startServer();
        await httpServer.stopServer();
    };
    for (let i = 0; i < 10; ++i) {
        if (i > 50)
            console.log("i = " + i);
        await foo();
    }
});

unit.test("web_test: httpClient.start timeout", async () => {
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    let client = new network.HttpClient("http://localhost:44332");
    client.httpClient_.__changeStartTimeoutMillis(1000);
    console.log("client.start...");
    await client.start(clientKey, nodeKey.publicKey).then(()=>{
        assert(false); // we should check timeout, server is not started
    }, (errText)=>{
        //console.log("client.start... reject: " + errText);
        assert(true);
    });
});

/*unit.test("web_test: many clients", async () => {
    for (let i = 0; i < 20000; i++) {
        console.log(i);
        let httpServer = new network.HttpServer("0.0.0.0", 8080, 256);
        let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
        let clientKey = await crypto.PrivateKey.generate(2048);
        httpServer.initSecureProtocol(nodeKey);
        httpServer.startServer();

        let client = new network.HttpClient("http://localhost:8080");
        await client.start(clientKey, nodeKey.publicKey);

        await httpServer.stopServer();
        await client.stop();
        //gc();
    }
});*/

unit.test("web_test: cpp exceptions", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer.startServer();
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    let httpClient = new network.HttpClient("http://localhost:8080");
    try {
        await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

        let testData = t.randomBytes(100);

        let hashOk = null;
        await httpClient.command("testEndpoint", {testData: testData}, async (resp) => {
            hashOk = t.valuesEqual(resp.hash, crypto.HashId.of(testData));
        }, error => {
            console.log("exception: " + error);
        });

        while (hashOk == null) {
            await sleep(50);
        }

        console.logPut("hash ok: " + hashOk);
        assert(false); // this test should to produce exception
    } catch (e) {
        let s = "" + e;
        //for now, http client tries to reconnect several times
        assert(s.includes("Session does not created or session key is not got yet") === true);
    }

    await httpClient.stop();
    await httpServer.stopServer();
});

unit.test("web_test: httpClient retry command", async () => {
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    let clientKey = await crypto.PrivateKey.generate(2048);
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer.initSecureProtocol(nodeKey);
    httpServer.startServer();
    let httpClient = new network.HttpClient("http://localhost:8080");

    await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

    await httpServer.stopServer();
    httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer.initSecureProtocol(nodeKey);
    httpServer.addSecureEndpoint("testEndpoint", async (reqParams, clientPublicKey) => {
        return {hash: crypto.HashId.of(reqParams.testData)};
    });
    httpServer.startServer();

    let testData = t.randomBytes(100);

    let hashOk = null;
    let errText = null;
    await httpClient.command("testEndpoint", {testData: testData}, async (resp) => {
        hashOk = t.valuesEqual(resp.hash, crypto.HashId.of(testData));
    }, error => {
        console.log("exception: " + error);
        errText = error;
        hashOk = false;
    });

    while (hashOk === null) {
        await sleep(50);
    }

    assert(hashOk === true);

    await httpClient.stop();
    await httpServer.stopServer();
});

unit.test("web_test: http v3", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer.addSecureEndpoint("testEndpoint", async (reqParams, clientPublicKey) => {
        return {hash: crypto.HashId.of(reqParams.testData).digest};
    });
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    httpServer.initSecureProtocol(nodeKey);
    httpServer.startServer();

    let clientKey = nodeKey;
    //let httpClient = new network.HttpClient("http://192.168.1.117:9999");
    let httpClient = new network.HttpClient("http://localhost:8080");
    try {
        await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

        let testData = t.randomBytes(100);
        console.log("testData: " + btoa(testData));

        let hashOk = null;
        await httpClient.command("testEndpoint", {testData: testData}, async (resp) => {
            hashOk = t.valuesEqual(crypto.HashId.withDigest(resp.hash), crypto.HashId.of(testData));
        }, error => {
            console.log("exception: " + error);
        });

        while (hashOk == null) {
            await sleep(50);
        }

        console.logPut("hash ok: " + hashOk);
    } catch (e) {
        let s = "" + e;
        console.error(s);
    }
    await httpClient.stop();

    await httpServer.stopServer();
});

unit.test("web_test: http request timeout", async () => {
    console.logPut(" please, wait for timeout...");
    let httpServer = new network.HttpServer("0.0.0.0", 9080, 20);
    let releaseServer = 0;
    httpServer.addSecureEndpoint("testEndpoint", async (reqParams, clientPublicKey) => {
        while (releaseServer !== 1)
            await sleep(100);
        releaseServer = 2;
        return {hash: crypto.HashId.of(reqParams.testData).digest};
    });
    let nodeKey = new crypto.PrivateKey(atob("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    httpServer.initSecureProtocol(nodeKey);
    httpServer.startServer();

    let clientKey = nodeKey;
    let httpClient = new network.HttpClient("http://localhost:9080");
    try {
        await httpClient.start(clientKey, new crypto.PublicKey(nodeKey));

        let testData = t.randomBytes(100);

        let done = null;
        await httpClient.command("testEndpoint", {testData: testData}, async (resp) => {
            assert(false); // this test should catch timeout
        }, error => {
            console.logPut(" exception: " + error.errorRecord.message);
            done = true;
            assert(true)
        });

        while (done == null)
            await sleep(50);
        releaseServer = 1;
        while (releaseServer === 1)
            await sleep(100);
    } catch (e) {
        let s = "" + e;
        console.error(s);
        assert(false);
    }
    await httpClient.stop();

    await httpServer.stopServer();
});

unit.test("web_test: http to restarting node", async () => {
    const HttpClient = require('web').HttpClient;
    console.log();
    let localNodePrivKey = await crypto.PrivateKey.generate(2048);
    let localNodePubKey = localNodePrivKey.publicKey;

    let httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer.initSecureProtocol(localNodePrivKey);
    httpServer.addSecureEndpoint("getState", async (reqParams, clientPublicKey) => {
        return {answer:"answer-from-local-http-server"};
    });
    httpServer.startServer();

    let clientPrivKey = await crypto.PrivateKey.generate(2048);
    let nodeUrl = "http://localhost:8080";

    let someHashId = await crypto.HashId.of(t.randomBytes(64));

    let httpClient = new HttpClient(nodeUrl);
    await httpClient.start(clientPrivKey, localNodePubKey);
    console.log("client started");

    let okCounter = 0;
    let errorCounter = 0;
    let sendCounter = 0;
    for (let i = 0; i < 1000; ++i) {
        ++sendCounter;
        await httpClient.command("getState", {itemId: someHashId}, async res => {
            ++okCounter;
            //console.log("okCounter = " + okCounter + ", errorCounter = " + errorCounter);
        }, (e) => {
            console.log(i + " 1 error: " + e);
            ++errorCounter;
            console.log("okCounter = " + okCounter + ", errorCounter = " + errorCounter);
        });
        if (sendCounter - 100 > okCounter+errorCounter) {
            //console.log("sendCounter = " + sendCounter);
            await sleep(100);
        }
    }
    while (okCounter < sendCounter)
        await sleep(100);

    await sleep(2000);
    console.log("stop server...");
    await httpServer.stopServer();
    console.log("wait...");
    await sleep(2000);
    console.log("recreate server...");
    httpServer = new network.HttpServer("0.0.0.0", 8080, 20);
    console.log("init server...");
    httpServer.initSecureProtocol(localNodePrivKey);
    httpServer.addSecureEndpoint("getState", async (reqParams, clientPublicKey) => {
        return {answer:"answer-from-local-http-server"};
    });
    console.log("start server...");
    httpServer.startServer();
    console.log("start server... done!");

    okCounter = 0;
    errorCounter = 0;
    sendCounter = 0;
    for (let i = 0; i < 1000; ++i) {
        ++sendCounter;
        await httpClient.command("getState", {itemId: someHashId}, async res => {
            ++okCounter;
            //console.log("okCounter = " + okCounter + ", errorCounter = " + errorCounter);
        }, (e) => {
            console.log(i + " 1 error: " + e);
            ++errorCounter;
            console.log("okCounter = " + okCounter + ", errorCounter = " + errorCounter);
        });
        if (sendCounter - 100 > okCounter+errorCounter) {
            //console.log("sendCounter = " + sendCounter);
            await sleep(100);
        }
    }
    while (okCounter < sendCounter)
        await sleep(100);

    assert(true); // this test just should not stuck

    console.log("stop server and client...");
    await httpServer.stopServer();
    await httpClient.stop();
});

unit.test("web_test: http server start exception", async () => {
    let localNodePrivKey = await crypto.PrivateKey.generate(2048);

    let httpServer1 = new network.HttpServer("0.0.0.0", 8080, 20);
    httpServer1.initSecureProtocol(localNodePrivKey);
    httpServer1.startServer();

    try {
        let httpServer2 = new network.HttpServer("0.0.0.0", 8080, 20);
        assert(false); // should throw exception
    } catch (e) {
        //console.log("exception: " + e);
        assert(true); // wait for exception
    }

    await httpServer1.stopServer();
});

unit.test("web_test: dns server hello world", async () => {
    console.log();
    let dnsServer = new DnsServer();
    dnsServer.setQuestionCallback(async question => {
        console.log("question name = " + question.name + ", rType = " + question.rType);
        question.resolveThroughUplink_start();
        //await sleep(500); // imitate long processing
        if (question.name === "test.ya.ru") {
            if (question.rType === DnsRRType.DNS_A || question.rType === DnsRRType.DNS_ANY)
                question.addAnswer_typeA(300, "127.0.0.1");
            if (question.rType === DnsRRType.DNS_AAAA || question.rType === DnsRRType.DNS_ANY)
                question.addAnswer_typeAAAA(600, "2a02:6b8::2:242");
            if (question.rType === DnsRRType.DNS_CNAME || question.rType === DnsRRType.DNS_ANY)
                question.addAnswer_typeCNAME(500, "ya.ru");
            if (question.rType === DnsRRType.DNS_MX || question.rType === DnsRRType.DNS_ANY)
                question.addAnswer_typeMX(550, 20, "alt-mx.ya.ru");
            if (question.rType === DnsRRType.DNS_TXT || question.rType === DnsRRType.DNS_ANY) {
                question.addAnswer_typeTXT(500, "aaa bbb ccc dddd dddd eeee d 24");
                question.addAnswer_typeTXT(600, "aaa bbb ccc dddd dddd eeee d 600");
                question.addAnswer_typeTXT(700, "aaa bbb ccc dddd dddd eeee d 700");
                question.addAnswer_typeTXT(800, "longtext01longtext02longtext03longtext04longtext05longtext06longtext07longtext08longtext09longtext10longtext11longtext12longtext13longtext14longtext15longtext16longtext17longtext18longtext19longtext20longtext21longtext22longtext23longtext24longtext2512345");
            }
            question.sendAnswer();
        } else {
            question.resolveThroughUplink_finish();
        }
    });
    dnsServer.start("0.0.0.0", 5353, "8.8.4.4");

    await sleep(9000);

    await dnsServer.stop();
});
