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

unit.test("worker_tests: hello worker", async () => {
    let worker = await WorkerExample.start();
    for (let i = 0; i < 10; ++i)
        console.log("3 * 4 * " + i + " = " + await worker.calcAxBxC(3, 4, i));
    worker.release();
});

// unit.test("worker_tests: check that all global objects are frozen bak", async () => {
//     //let global = Function('return this')();
//     let global = Function('return crypto')();
//     let globalItems = new Set();
//     for (let k in global) {
//         globalItems.add(k);
//     }
//     let checkFunction = (global, functionName) => {
//         try {
//             global[functionName] = null;
//             assert(false);
//         } catch (e) {
//             if (!(e instanceof TypeError))
//                 throw e;
//         } finally {
//             globalItems.delete(functionName);
//         }
//     };
//     let checkItem = (item, functionName) => {
//         try {
//             item[functionName] = null;
//             assert(false);
//         } catch (e) {
//             if (!(e instanceof TypeError))
//                 throw e;
//         } finally {
//             globalItems.delete(functionName);
//         }
//     };
//     // checkFunction(global, "__bios_print");
//     // checkFunction(global, "__debug_throw");
//     // checkFunction(global, "__bios_loadRequired");
//     // checkFunction(global, "__bios_initTimers");
//     // checkFunction(global, "exit");
//     // checkFunction(global, "utf8Decode");
//     // checkFunction(global, "utf8Encode");
//     // checkFunction(global, "$0");
//     // checkFunction(global, "__hardware_concurrency");
//     // checkFunction(global, "__init_workers");
//     // checkFunction(global, "__send_from_worker");
//     // checkFunction(global, "IOFile");
//     // checkFunction(global, "IODir");
//     // checkFunction(global, "IOTCP");
//     // checkFunction(global, "IOTLS");
//     // checkFunction(global, "IOUDP");
//     // checkItem(crypto.HashId, "of");
//     // checkFunction(global, "atob");
//     // checkFunction(global, "btoa");
//     // checkFunction(global, "__verify_extendedSignature");
//     crypto.HashId._lkwefjoweijf_ = true;
//     console.log("crypto.HashId.of: " + crypto.HashId.of);
//
//     if (globalItems.size > 0) {
//         for (let k of globalItems)
//             console.error("unckecked global item: " + k);
//         assert(false);
//     }
// });

// unit.test("worker_tests: check that all global objects are frozen", async () => {
//     let checkFunction = (o, functionName) => {
//         try {
//             o[functionName]._wefhowegfh_add_some_field_ = true;
//             console.error(functionName + ": " + o[functionName]._wefhowegfh_add_some_field_);
//             assert(false);
//         } catch (e) {
//             if (!(e instanceof TypeError))
//                 throw e;
//         }
//         try {
//             o[functionName] = null;
//             console.error(functionName + ": " + o[functionName]);
//             assert(false);
//         } catch (e) {
//             if (!(e instanceof TypeError))
//                 throw e;
//         }
//     };
//     let checkObject = (o) => {
//         for (let k in o) {
//             let val = o[k];
//             let descr = "undefined";
//             if (val)
//                 descr = val.constructor.name;
//             console.log("k: " + k + " - " + descr);
//             if (descr === "Function")
//                 checkFunction(o, k);
//             else if (descr === "Object")
//                 checkObject(val);
//             else
//                 checkFunction(o, k);
//         }
//     };
//     checkObject(Function('return this')());
// });

/*unit.test("worker_tests: isolate js context", async () => {
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
        console.log("i=" + i + ", " + res.base64);
        assert(res.equals(crypto.HashId.of(val)));
    }
    worker.release();

    // iterate all workers in pool, call changeCrypto() for each of them
    for (let i = 0; i < 200; ++i) {
        console.log("i = " + i);
        let worker2 = await Worker2.start();
        await worker2.changeCrypto();
        worker2.release();
    }

    worker = await Worker.start();
    for (let i = 0; i < 10; ++i) {
        let val = "hello"+i;
        let res = crypto.HashId.withDigest(await worker.doSomething(val));
        console.log("i=" + i + ", " + res.base64);
        //assert(res.equals(crypto.HashId.of(val)));
    }
    worker.release();
});*/
