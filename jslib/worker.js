/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;

let wrk = {};

wrk.WorkerHandle = class {
    constructor(workerImpl) {
        this.workerImpl = workerImpl;
        this.onReceiveCallback = obj => {};
        this.nextFarcallSN = 0;
        this.callbacksFarcall = new Map();
        this.export = {};
    }

    onReceive(block) {
        this.onReceiveCallback = block;
    }

    startFarcallCallbacks() {
        this.onReceive(async (obj) => {
            let ref = obj.ref;
            if (ref !== undefined) {
                if (this.callbacksFarcall.has(ref)) {
                    let ca = this.callbacksFarcall.get(ref);
                    if (obj.error !== undefined)
                        ca[1](obj.error);
                    else
                        ca[0](await DefaultBiMapper.getInstance().deserialize(obj.result));
                    this.callbacksFarcall.delete(ref);
                }
            } else {
                let cmd = obj.cmd;
                if (cmd && this.export[cmd]) {
                    try {
                        //console.error("???");
                        let res = await this.export[cmd](
                            await DefaultBiMapper.getInstance().deserialize(obj.args),
                            await DefaultBiMapper.getInstance().deserialize(obj.kwargs)
                        );
                        await this.send({serial: this.getNextFarcallSN(), ref: obj.serial, result: res});
                    } catch (e) {
                        console.error("~~~");
                        //await this.send({serial: this.getNextFarcallSN(), ref: obj.serial, error: {class:e.constructor.name, text:e.toString()}});
                    }
                }
            }
        });
    }

    async send(obj) {
        if (obj.hasOwnProperty("args"))
            obj.args = await DefaultBiMapper.getInstance().serialize(obj.args);
        if (obj.hasOwnProperty("kwargs"))
            obj.kwargs = await DefaultBiMapper.getInstance().serialize(obj.kwargs);
        if (obj.hasOwnProperty("result"))
            obj.result = await DefaultBiMapper.getInstance().serialize(obj.result);

        this.workerImpl._send(obj);
    }

    async farcall(cmd, args, kwargs, onComplete = null, onError = (e)=>{}) {
        let id = this.getNextFarcallSN();
        if (onComplete != null)
            this.callbacksFarcall.set(id, [onComplete, onError]);
        await this.send({serial: id, cmd: cmd, args: args, kwargs: kwargs});
    }

    release() {
        this.workerImpl._release();
    }

    async close() {
    }

    getNextFarcallSN() {
        let res = this.nextFarcallSN;
        ++this.nextFarcallSN;
        if (this.nextFarcallSN >= Number.MAX_SAFE_INTEGER)
            this.nextFarcallSN = 0;
        return res;
    }
};

wrk.getWorker = function(accessLevel, workerSrc, customJsLib = {}) {
    return new Promise(resolve => {
        wrkImpl.__getWorker(accessLevel, workerSrc, workerImpl => {
            let w = new wrk.WorkerHandle(workerImpl);
            w.workerImpl._setOnReceive(obj => w.onReceiveCallback(obj));
            resolve(w);
        }, customJsLib);
    });
};

wrk.consoleWrapper = `
let console = {
    log(...args) {
        wrkInner.farcall("__worker_bios_print", [false, args, "\\n"], {});
    },
    logPut(...args) {
        wrkInner.farcall("__worker_bios_print", [false, args, ""], {});
    },
    info(...args) {
        wrkInner.farcall("__worker_bios_print", [false, args, "\\n"], {});
    },
    error(...args) {
        if (args[0] instanceof Error)
            wrkInner.farcall("__worker_bios_print", [true, ["Error: ", args[0].message, ...args.slice(1), "\\n", args[0].stack], "\\n"], {});
        else
            wrkInner.farcall("__worker_bios_print", [true, args, "\\n"], {});
    }
};
`;

wrk.farcallWrapper = `
wrkInner.onReceive = async (obj) => {
    const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
    let cmd = obj.cmd;
    if (cmd && wrkInner.export[cmd]) {
        try {
            let res = await wrkInner.export[cmd](
                await DefaultBiMapper.getInstance().deserialize(obj.args),
                await DefaultBiMapper.getInstance().deserialize(obj.kwargs)
            );
            await wrkInner.send({serial:wrkInner.getNextFarcallSN(), ref:obj.serial, result:res});
        } catch(e) {
            await wrkInner.send({serial:wrkInner.getNextFarcallSN(), ref:obj.serial, error: {class:e.constructor.name, text:e.toString()}});
        }
    } else if (obj.result !== undefined) {
        let ref = obj.ref;
        if (wrkInner.callbacksFarcall.has(ref)) {
            wrkInner.callbacksFarcall.get(ref)(await DefaultBiMapper.getInstance().deserialize(obj.result));
            wrkInner.callbacksFarcall.delete(ref);
        }
    }
}
wrkInner.farcall = async (cmd, args, kwargs, onComplete = null) => {
    let id = wrkInner.getNextFarcallSN();
    if (onComplete != null)
        wrkInner.callbacksFarcall.set(id, onComplete);
    await wrkInner.send({serial:id, cmd:cmd, args:args, kwargs:kwargs});
}
`;

Object.freeze(wrk.__getWorker);
Object.freeze(wrk.WorkerHandle);
Object.freeze(wrk.getWorker);
Object.freeze(wrk);

module.exports = wrk;
