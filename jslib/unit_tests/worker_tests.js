/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
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

unit.test("worker_tests: hello worker", async () => {
    let worker = await WorkerExample.start();
    for (let i = 0; i < 10; ++i)
        console.log("3 * 4 * " + i + " = " + await worker.calcAxBxC(3, 4, i));
    worker.release();
});

unit.test("worker_tests: check that all global objects are frozen", async () => {
    let testSrc = `
    let checkFunction = (o, functionName) => {
        try {
            o[functionName]._wefhowegfh_add_some_field_ = true;
            if (o[functionName]._wefhowegfh_add_some_field_ === true) {
                console.error(functionName + "._wefhowegfh_add_some_field_: should be frozen");
                assert(false);
            }
        } catch (e) {
            if (!(e instanceof TypeError))
                throw e;
        }
        try {
            o[functionName] = null;
            if (o[functionName] === null) {
                console.error(functionName + ": " + o[functionName] + " - should be frozen");
                assert(false);
            }
        } catch (e) {
            if (!(e instanceof TypeError))
                throw e;
        }
    };
    let checkObject = (prefix, o) => {
        for (let k in o) {
            let val = o[k];
            let descr = "undefined";
            if (val)
                descr = val.constructor.name;
            console.log("k: " + prefix + k + " - " + descr);
            if (descr === "Function")
                checkFunction(o, k);
            else if (descr === "Object")
                checkObject(prefix+k+".", val);
            else
                checkFunction(o, k);
        }
    };
    `;
    console.log("main scripter:");
    eval(testSrc + `checkObject("", Function('return this')());`);

    console.log("worker scripter:");
    class Worker {
        constructor() {this.worker = null;}
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await wrk.getWorker(0, wrk.farcallWrapper+testSrc+`
            wrk.export.checkObject = async (args, kwargs) => {
                checkObject("", Function('return this')());
            }
            `);
            res.worker.startFarcallCallbacks();
            return res;
        }
        checkObject() {
            return new Promise(resolve => this.worker.farcall("checkObject", [], {}, ans => {
                resolve(ans);
            }));
        }
    }
    let worker = await Worker.start();
    //TODO: check it with worker too
    //await worker.checkObject();
    worker.release();
});

unit.test("worker_tests: isolate js context", async () => {
    class Worker {
        constructor() {this.worker = null;}
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await wrk.getWorker(0, wrk.farcallWrapper+`
            wrk.export.doSomething = async (args, kwargs) => {
                return crypto.HashId.of(args[0]).digest;
            }
            `);
            res.worker.startFarcallCallbacks();
            return res;
        }
        doSomething(a) {
            return new Promise(resolve => this.worker.farcall("doSomething", [a], {}, ans => {
                resolve(ans);
            }));
        }
    }

    class Worker2 {
        constructor() {this.worker = null;}
        release() {this.worker.release();}
        static async start() {
            let res = new Worker2();
            res.worker = await wrk.getWorker(0, wrk.farcallWrapper+`
            wrk.export.changeCrypto = async (args, kwargs) => {
                crypto.HashId.of = (val) => {
                    return crypto.HashId.of_sync("111");
                };
            }
            `);
            res.worker.startFarcallCallbacks();
            return res;
        }
        changeCrypto() {
            return new Promise(resolve => this.worker.farcall("changeCrypto", [], {}, ans => {
                resolve(ans);
            }));
        }
    }

    let worker = await Worker.start();
    for (let i = 0; i < 10; ++i) {
        let val = "hello"+i;
        let res = crypto.HashId.withDigest(await worker.doSomething(val));
        //console.log("i=" + i + ", " + res.base64);
        assert(res.equals(crypto.HashId.of(val)));
    }
    worker.release();

    // iterate all workers in pool, call changeCrypto() for each of them
    for (let i = 0; i < 200; ++i) {
        let worker2 = await Worker2.start();
        await worker2.changeCrypto();
        worker2.release();
    }

    worker = await Worker.start();
    for (let i = 0; i < 10; ++i) {
        let val = "hello"+i;
        let res = crypto.HashId.withDigest(await worker.doSomething(val));
        //console.log("i=" + i + ", " + res.base64);
        assert(res.equals(crypto.HashId.of(val)));
    }
    worker.release();
});
