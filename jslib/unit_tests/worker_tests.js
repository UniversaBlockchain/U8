/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, jsonRpcWrapper} from 'worker'

class WorkerExample {

    static workerSrc = wrk.jsonRpcWrapper + `
    function print(text) {
        wrk.sendJsonRpc("print", [text]);
    }
    
    function callSomethingFromMainScripter(val) {
        return new Promise(resolve => wrk.sendJsonRpc("callSomethingFromMainScripter", [val], ans => {
            resolve(ans);
        }));
    }
    
    wrk.export.calcAxB = async (params) => {
        let textLen = await callSomethingFromMainScripter("some_parameter");
        print(textLen);
        return params[0] * params[1];
    };
    `;

    constructor() {
        this.worker = null;
    }

    static async start() {
        let res = new WorkerExample();
        res.worker = await wrk.getWorker(0, WorkerExample.workerSrc);
        res.worker.startJsonRpcCallbacks();

        res.worker.export["callSomethingFromMainScripter"] = (params) => {
            // return val.length to worker
            let valLength = params[0].length;
            return valLength;
        };

        res.worker.export["print"] = (params) => {
            console.log("worker prints: " + params[0]);
        };

        return res;
    }

    release() {
        this.worker.release();
    }

    calcAxB(a, b) {
        return new Promise(resolve => this.worker.sendJsonRpc("calcAxB", [a, b], ans => {
            resolve(ans);
        }));
    }
}

unit.test("hello worker", async () => {
    let worker = await WorkerExample.start();
    for (let i = 0; i < 100; ++i)
        console.log("11 * "+i+" = " + await worker.calcAxB(11, i));
    worker.release();
});
