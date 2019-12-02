/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

// Launch as:
//   u8 helloworld_http.js
//
// See details at https://kb.universablockchain.com/u8_hello_world/221

import {HttpServer} from 'web'

async function main(args) {
    let httpServer = new HttpServer("0.0.0.0", 8080, platform.hardwareConcurrency);
    httpServer.addRawEndpoint("/hello", async(request) => {
        let nameArg = request.queryParamsMap.get("name");
        let name = (typeof nameArg === "undefined")? "world" : nameArg;
        request.setHeader("Content-Type", "text/html");
        request.setAnswerBody(`Hello, <b>${name}</b>!`);
        request.sendAnswer();
    });
    httpServer.startServer();
    await sleep(10 * 60 * 1000);
}
