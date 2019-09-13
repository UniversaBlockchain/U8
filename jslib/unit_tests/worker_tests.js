/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, jsonRpcWrapper} from 'worker'

class WorkerExample {

    static workerSrc = wrk.jsonRpcWrapper + `
    wrk.export.calcAxB = (params) => {
        return params[0] * params[1];
    };
    `;

    constructor() {
        this.worker = null;
    }

    static async init() {
        let res = new WorkerExample();
        res.worker = await wrk.getWorker(0, WorkerExample.workerSrc);
        res.worker.startJsonRpcCallbacks();
        return res;
    }

    release() {
        this.worker.release();
    }

    async calcAxB(a, b) {
        return new Promise(resolve => this.worker.sendJsonRpc("calcAxB", [a, b], ans => {
            resolve(ans);
        }));
    }
}

unit.test("hello worker", async () => {
    for (let i = 0; i < 100; ++i) {
        let worker = await WorkerExample.init();
        console.log("11 * "+i+" = " + await worker.calcAxB(11, i));
        worker.release();
    }
});
