/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import {getWorker, consoleWrapper, farcallWrapper} from 'worker'

class WorkerExample {

    static workerSrc = consoleWrapper + farcallWrapper + `
    function callSomethingFromMainScripter(val) {
        return new Promise(resolve => wrkInner.farcall("callSomethingFromMainScripter", [], {text:val}, ans => {
            resolve(ans);
        }));
    }
    
    wrkInner.export.calcAxBxC = async (args, kwargs) => {
        let textLen = await callSomethingFromMainScripter("some_parameter");
        console.log(textLen);
        return args[0] * args[1] * args[2];
    };
    `;

    constructor() {
        this.worker = null;
    }

    static async start() {
        let res = new WorkerExample();
        res.worker = await getWorker(1, WorkerExample.workerSrc);
        res.worker.startFarcallCallbacks();

        res.worker.export["callSomethingFromMainScripter"] = (args, kwargs) => {
            // return val.length to worker
            let valLength = kwargs.text.length;
            return valLength;
        };

        res.worker.export["__worker_bios_print"] = (args, kwargs) => {
            let out = args[0] === true ? console.error : console.logPut;
            out(...args[1], args[2]);
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
    let fails = "";
    let delayedAssert = (condition, text) => {
        if (!condition)
            fails += text + "\n";
    };

    let testSrc = `
    const BigDecimal  = require("big").Big;
    
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
    let checkObject = (prefix, o, useConsole) => {
        for (let k in o) {
            let val = o[k];
            let descr = "undefined";
            if (val)
                descr = val.constructor.name;
                console.log("k: " + prefix + k + " - " + descr);
            if (descr === "Function")
                checkFunction(o, k);
            else if (descr === "Object")
                checkObject(prefix+k+".", val, useConsole);
            else
                checkFunction(o, k);
        }
    };
    `;
    console.log("main scripter:");
    eval(testSrc + `checkObject("", Function('return this')(), true);`);

    class Worker {
        constructor() {this.worker = null;}
        release() {this.worker.release();}
        static async start(accessLevel) {
            let res = new Worker();
            let wrappers = accessLevel === 1 ? consoleWrapper+farcallWrapper : farcallWrapper;
            res.worker = await getWorker(accessLevel, wrappers+testSrc+`
            wrkInner.export.checkObject = async (args, kwargs) => {
                wrkInner.farcall("say_platform", [], {platform:platform});
                checkObject("", Function('return this')(), false);
            }
            `);
            res.worker.export["__worker_bios_print"] = (args, kwargs) => {
                let out = args[0] === true ? console.error : console.logPut;
                out(...args[1], args[2]);
            };
            res.worker.export["say_platform"] = (args, kwargs) => {
                console.log("worker say_platform: " + JSON.stringify(kwargs.platform));
                if (accessLevel === 0) {
                    delayedAssert(kwargs.platform.accessLevel === 0, "kwargs.platform.accessLevel");
                    delayedAssert(kwargs.platform.accessLevelName === 'full', "kwargs.platform.accessLevelName");
                    delayedAssert(kwargs.platform.hardwareConcurrency === platform.hardwareConcurrency, "kwargs.platform.hardwareConcurrency");
                } else {
                    delayedAssert(kwargs.platform.accessLevel === 1, "kwargs.platform.accessLevel");
                    delayedAssert(kwargs.platform.accessLevelName === 'restricted', "kwargs.platform.accessLevelName");
                    delayedAssert(kwargs.platform.hardwareConcurrency === 1, "kwargs.platform.hardwareConcurrency");
                }
            };
            res.worker.startFarcallCallbacks();
            return res;
        }
        checkObject() {
            return new Promise(resolve => this.worker.farcall("checkObject", [], {}, ans => {
                resolve(ans);
            }));
        }
    }

    console.log("worker scripter accessLevel0:");
    let worker0 = await Worker.start(0);
    await worker0.checkObject();
    worker0.release();

    console.log("worker scripter accessLevel1:");
    let worker1 = await Worker.start(1);
    await worker1.checkObject();
    worker1.release();

    if (fails !== "") {
        console.error(fails);
        assert(false);
    }
});

unit.test("worker_tests: isolate js context", async () => {
    class Worker {
        constructor() {this.worker = null;}
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await getWorker(0, farcallWrapper+`
            wrkInner.export.doSomething = async (args, kwargs) => {
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
            res.worker = await getWorker(0, farcallWrapper+`
            wrkInner.export.changeCrypto = async (args, kwargs) => {
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

unit.test("worker_tests: clean wrk object", async () => {
    let counter = 1;
    class Worker {
        constructor() {
            this.worker = null;
            this.funcName = "func" + counter++;
        }
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await getWorker(0, farcallWrapper+`
            wrkInner.export.`+res.funcName+` = async (args, kwargs) => {
                return Object.keys(wrkInner.export).length;
                //return JSON.stringify(Object.keys(wrkInner.export));
            }
            `);
            res.worker.startFarcallCallbacks();
            return res;
        }
        doSomething() {
            return new Promise(resolve => this.worker.farcall(this.funcName, [], {}, ans => {
                resolve(ans);
            }));
        }
    }

    for (let i = 0; i < 200; ++i) {
        let worker = await Worker.start();
        let ans = await worker.doSomething();
        //console.log("ans: " + ans);
        assert(ans === 1);
        worker.release();
    }

});

unit.test("worker_tests: import custom js lib", async () => {
    let counter = 1;
    class Worker {
        constructor() {
            this.worker = null;
        }
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            let customLibFiles = {"lib_file1.js": `
            function libfunc1(s) {
                return "lib1 " + s;
            }
            module.exports = {libfunc1};
            `,
            "lib_file2.js":`
            function libfunc2(s) {
                return "lib2 " + s;
            }
            module.exports = {libfunc2};
            `};
            res.worker = await getWorker(1, consoleWrapper + farcallWrapper+`
            const libfunc1 = require('lib_file1.js').libfunc1;
            const libfunc2 = require('lib_file2.js').libfunc2;
            wrkInner.export.doSomething = async (args, kwargs) => {
                return libfunc2(libfunc1("func1_result"));
            }
            `, customLibFiles);
            res.worker.startFarcallCallbacks();

            res.worker.export["__worker_bios_print"] = (args, kwargs) => {
                let out = args[0] === true ? console.error : console.logPut;
                out(...args[1], args[2]);
            };

            return res;
        }
        doSomething() {
            return new Promise(resolve => this.worker.farcall("doSomething", [], {}, ans => {
                resolve(ans);
            }));
        }
    }

    for (let i = 0; i < 200; ++i) {
        let worker = await Worker.start();
        let ans = await worker.doSomething();
        //console.log("ans: " + ans);
        assert(ans === "lib2 lib1 func1_result");
        worker.release();
    }

});

unit.test("worker_tests: exceptions from worker", async () => {
    class Worker {
        constructor() {
            this.worker = null;
        }
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await getWorker(1, consoleWrapper + farcallWrapper+`
            wrkInner.export.doSomething = async (args, kwargs) => {
                throw "some_error_text";
                return "some_answer";
            }
            `);
            res.worker.startFarcallCallbacks();

            res.worker.export["__worker_bios_print"] = (args, kwargs) => {
                let out = args[0] === true ? console.error : console.logPut;
                out(...args[1], args[2]);
            };

            return res;
        }
        doSomething() {
            return new Promise((resolve,reject) => this.worker.farcall("doSomething", [], {}, resolve, reject));
        }
    }

    for (let i = 0; i < 200; ++i) {
        let worker = await Worker.start();
        try {
            let ans = await worker.doSomething();
            console.log("ans: " + ans);
            assert(false);
        } catch (e) {
            assert(e.text === "some_error_text");
        }
        worker.release();
    }
});

unit.test("worker_tests: exceptions from main scripter", async () => {
    class Worker {
        constructor() {
            this.worker = null;
        }
        release() {this.worker.release();}
        static async start() {
            let res = new Worker();
            res.worker = await getWorker(1, consoleWrapper + farcallWrapper+`
            function callMeFromWorker(val) {
                return new Promise((resolve,reject) => wrkInner.farcall("callMeFromWorker", [val], {}, resolve, reject));
            }
            
            wrkInner.export.doSomething = async (args, kwargs) => {
                await callMeFromWorker(33);
                return "some_answer";
            }
            `);
            res.worker.startFarcallCallbacks();

            res.worker.export["__worker_bios_print"] = (args, kwargs) => {
                let out = args[0] === true ? console.error : console.logPut;
                out(...args[1], args[2]);
            };

            res.worker.export["callMeFromWorker"] = (args, kwargs) => {
                //console.log("callMeFromWorker hit: " + args[0]);
                throw "some_error_text";
            };

            return res;
        }
        doSomething() {
            return new Promise((resolve,reject) => this.worker.farcall("doSomething", [], {}, resolve, reject));
        }
    }

    for (let i = 0; i < 200; ++i) {
        let worker = await Worker.start();
        try {
            let ans = await worker.doSomething();
            console.log("ans: " + ans);
            assert(false);
        } catch (e) {
            //console.log("e: " + JSON.stringify(e));
            assert(e.text === "some_error_text");
        }
        worker.release();
    }
});

unit.test("worker_tests: access levels order", async () => {
    // Today (2019-10-18) there is not able to create subworker from worker code.
    // However, getWorker function should to check access levels.
    try {
        await getWorker(-1, "");
        assert(false);
    } catch (e) {
        assert(true);
    }
});
