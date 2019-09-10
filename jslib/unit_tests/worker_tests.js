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
    console.log();
    let pubKey1 = (await crypto.PrivateKey.generate(2048)).publicKey;
    console.log("random pub key 1: " + btoa(pubKey1.fingerprints));

    for (let i = 0; i < 10; ++i) {
        let worker = await createWorker();
        let resolver;
        let promise = new Promise((resolve, reject) => resolver = resolve);
        worker.onReceive(async obj => {
            console.log("worker.onReceive: " + JSON.stringify(obj));
            resolver();
        });
        worker.send({a: i, b: 20000, c: 7});
        await promise;
        await worker.close();
    }
    await sleep(100000);

    let pubKey2 = (await crypto.PrivateKey.generate(2048)).publicKey;
    console.log("random pub key 2: " + btoa(pubKey2.fingerprints));
});
