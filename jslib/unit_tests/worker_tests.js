/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {createWorker} from 'worker'

let workerSrc = `
wrk.onReceive = (obj) => {
    wrk.send(obj.a + obj.b + obj.c);
}
`;

unit.test("hello worker", async () => {
    let worker = await createWorker();
    let resolver;
    let promise = new Promise((resolve, reject) => resolver = resolve);
    worker.onReceive(async obj => {
        console.log("worker.onReceive: " + JSON.stringify(obj));
        resolver();
    });
    worker.send({a:5, b:6, c:7});
    await promise;
    await worker.close();
});
