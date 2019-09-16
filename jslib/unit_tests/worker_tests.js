/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, jsonRpcWrapper} from 'worker'

class WorkerExample {

    static workerSrc = wrk.farcallWrapper + `
    function print(text) {
        wrk.farcall("print", [], {text:text});
    }
    
    function callSomethingFromMainScripter(val) {
        return new Promise(resolve => wrk.farcall("callSomethingFromMainScripter", [], {text:val}, ans => {
            resolve(ans);
        }));
    }
    
    wrk.export.calcAxBxC = async (args, kwargs) => {
        let textLen = await callSomethingFromMainScripter("some_parameter");
        print(textLen);
        return args[0] * args[1] * args[2];
    };
    `;

    constructor() {
        this.worker = null;
    }

    static async start() {
        let res = new WorkerExample();
        res.worker = await wrk.getWorker(0, WorkerExample.workerSrc);
        res.worker.startFarcallCallbacks();

        res.worker.export["callSomethingFromMainScripter"] = (args, kwargs) => {
            // return val.length to worker
            let valLength = kwargs.text.length;
            return valLength;
        };

        res.worker.export["print"] = (args, kwargs) => {
            console.log("worker prints: " + kwargs.text);
        };

        return res;
    }

    release() {
        this.worker.release();
    }

    calcAxBxC(a, b, c) {
        return new Promise(resolve => this.worker.farcall("calcAxBxC", [a, b, c], {}, ans => {
            resolve(ans);
        }));
    }
}

unit.test("hello worker", async () => {
    let worker = await WorkerExample.start();
    for (let i = 0; i < 100; ++i)
        console.log("3 * 4 * " + i + " = " + await worker.calcAxBxC(3, 4, i));
    worker.release();
});
