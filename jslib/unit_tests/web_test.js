import {expect, unit, assert, assertSilent} from 'test'
import {HttpServer} from 'web'
import * as tk from 'unit_tests/test_keys'
const Boss = require('boss.js');
const ItemResult = require('itemresult.js');

unit.test("hello web", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 1, 20);
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
    httpServer.addEndpoint("/connect1", (request) => {
        request.setHeader("Content-Type", "text/html");
        console.log("js /connect");
        console.log("js /connect method: " + request.method);
        console.log("js /connect requestBody: " + Boss.load(request.requestBody));
        return {"ping": "pong"};
    });
    let unsRateDbg = 333;
    httpServer.addSecureEndpoint("unsRate", async (reqParams, sessionKey) => {
        //console.log(JSON.stringify(reqParams));
        console.log(btoa(sessionKey.packed));
        unsRateDbg += 1;
        await sleep(1);
        return {U: unsRateDbg};
    });
    httpServer.startServer();

    //let countToSend = 200000000;
    let countToSend = 2000;
    let receiveCounter = 0;

    let httpClient = new network.HttpClient(30, 30);
    let t00 = new Date().getTime();
    let t0 = new Date().getTime();
    let counter0 = 0;
    for (let i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("localhost:8080/testPage?a=73&b=1000000", (respCode, body) => {
            //console.log("[" + respCode + "]: " + body);
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

    httpServer.stopServer();
});
