// Launch as:
//   u8 helloworld_http.js

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
