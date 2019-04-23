import {expect, unit, assert, assertSilent} from 'test'
import {HttpServer} from 'udp_adapter'
import * as tk from 'unit_tests/test_keys'

unit.test("hello web", async () => {
    let httpServer = new network.HttpServer("0.0.0.0", 8080, 4);
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
    httpServer.startServer();
    await sleep(1000);
    httpServer.stopServer();
});
