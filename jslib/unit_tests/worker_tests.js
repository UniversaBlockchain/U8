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

    static workerSrcFarcall = wrk.farcallWrapper + `
    function print(text) {
        wrk.farcall("farcallPrint", [], {text:text});
    }
    
    function farcallSomethingFromMainScripter(val) {
        return new Promise(resolve => wrk.farcall("farcallSomethingFromMainScripter", [], {text:val}, ans => {
            resolve(ans);
        }));
    }
    
    wrk.export.calcAxBxC = async (args, kwargs) => {
        let textLen = await farcallSomethingFromMainScripter("some_parameter");
        print(textLen);
        return args[0] * args[1] * args[2];
    };
    `;

    constructor() {
        this.worker = null;
    }

    static async start(useFarcall) {
        let res = new WorkerExample();
        if (useFarcall) {
            res.worker = await wrk.getWorker(0, WorkerExample.workerSrcFarcall);
            res.worker.startFarcallCallbacks();
        } else {
            res.worker = await wrk.getWorker(0, WorkerExample.workerSrc);
            res.worker.startJsonRpcCallbacks();
        }

        res.worker.export["callSomethingFromMainScripter"] = (params) => {
            // return val.length to worker
            let valLength = params[0].length;
            return valLength;
        };

        res.worker.export["farcallSomethingFromMainScripter"] = (args, kwargs) => {
            // return val.length to worker
            let valLength = kwargs.text.length;
            return valLength;
        };

        res.worker.export["print"] = (params) => {
            console.log("worker prints: " + params[0]);
        };

        res.worker.export["farcallPrint"] = (args, kwargs) => {
            console.log("worker farcall prints: " + kwargs.text);
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

    calcAxBxC(a, b, c) {
        return new Promise(resolve => this.worker.farcall("calcAxBxC", [a, b, c], {}, ans => {
            resolve(ans);
        }));
    }
}

unit.test("hello worker", async () => {
    let worker = await WorkerExample.start(false);
    let workerFarcall = await WorkerExample.start(true);
    for (let i = 0; i < 100; ++i) {
        console.log("11 * " + i + " = " + await worker.calcAxB(11, i));
        console.log("3 * 4 * " + i + " = " + await workerFarcall.calcAxBxC(3, 4, i));
    }
    worker.release();
    workerFarcall.release();
});
