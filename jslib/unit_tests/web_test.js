import {expect, unit, assert, assertSilent} from 'test'
import {HttpServer} from 'udp_adapter'
import * as tk from 'unit_tests/test_keys'

unit.test("hello web", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 4, 10);
    let counter = 0;
    httpServer.addEndpoint("/testPage", (request) => {
        ++counter;
        request.setStatusCode(201);
        request.setHeader("header1", "header_value_1");
        request.setHeader("header2", "header_value_2");
        request.setAnswerBody(utf8Encode("httpServer: on /testPage counter="+counter));
        //typeof(plainText) == 'string' ? utf8Encode(plainText) : plainText
        request.sendAnswer();
    });
    httpServer.addEndpoint("/testPage2", (request) => {
        request.setAnswerBody(utf8Encode("httpServer: on /testPage2 some text"));
        request.sendAnswer();
    });
    httpServer.startServer();

    //let countToSend = 200000000;
    let countToSend = 2000;
    let receiveCounter = 0;

    let httpClient = new network.HttpClient(20);
    let t0 = new Date().getTime();
    let counter0 = 0;
    for (let i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("localhost:8080/testPage", (respCode, body) => {
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
    assert(receiveCounter == countToSend);

    httpServer.stopServer();
});
