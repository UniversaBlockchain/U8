/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {createWorker} from 'worker'

let workerSrc = `
function piSpigot(iThread, n) {
    let piIter = 0;
    let pi = new ArrayBuffer(n);
    let boxes = Math.floor(n * 10 / 3);
    let reminders = new ArrayBuffer(boxes);
    for (let i = 0; i < boxes; ++i)
        reminders[i] = 2;
    let heldDigits = 0;
    for (let i = 0; i < n; ++i) {
        let carriedOver = 0;
        let sum = 0;
        for (let j = boxes - 1; j >= 0; --j) {
            reminders[j] *= 10;
            sum = reminders[j] + carriedOver;
            let quotient = Math.floor(sum / (j*2 + 1));
            reminders[j] = sum % (j*2 + 1);
            carriedOver = quotient * j;
        }
        reminders[0] = sum % 10;
        let q = Math.floor(sum / 10);
        if (q == 9) {
            ++heldDigits;
        } else if (q == 10) {
            q = 0;
            for (let k = 1; k <= heldDigits; ++k) {
                let replaced = pi[i-k];
                if (replaced == 9)
                    replaced = 0;
                else
                    ++replaced;
                pi[i-k] = replaced;
            }
            heldDigits = 1;
        } else {
            heldDigits = 1;
        }
        pi[piIter++] = q;
    }
    let s = "";
    for (let i = piIter - 8; i < piIter; ++i)
        s += ""+pi[i];
    console.log(iThread + ": " + s);
    return s;
}

wrk.onReceive = (obj) => {
    //wrk.send(obj.a + obj.b + obj.c);
    let res = piSpigot(obj.a, obj.b);
    wrk.send(res);
}
`;

unit.test("hello worker", async () => {
    console.log();
    let pubKey1 = (await crypto.PrivateKey.generate(2048)).publicKey;
    console.log("random pub key 1: " + btoa(pubKey1.fingerprints));

    for (let i = 0; i < 10; ++i) {
        let workerHandle = await createWorker(0, workerSrc);
        let resolver;
        // let promise = new Promise((resolve, reject) => resolver = resolve);
        // workerHandle.onReceive(async obj => {
        //     console.log("workerHandle.onReceive: " + JSON.stringify(obj));
        //     resolver();
        // });
        workerHandle.send({a: i, b: 2000, c: 7});
        // await promise;
        await workerHandle.close();
    }
    await sleep(100000);

    let pubKey2 = (await crypto.PrivateKey.generate(2048)).publicKey;
    console.log("random pub key 2: " + btoa(pubKey2.fingerprints));
});
