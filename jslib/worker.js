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
            if (ref !== undefined && obj.result !== undefined) {
                if (this.callbacksFarcall.has(ref)) {
                    this.callbacksFarcall.get(ref)(obj.result);
                    this.callbacksFarcall.delete(ref);
                }
            } else {
                let cmd = obj.cmd;
                if (cmd && this.export[cmd]) {
                    let res = await this.export[cmd](
                        await DefaultBiMapper.getInstance().deserialize(obj.args),
                        await DefaultBiMapper.getInstance().deserialize(obj.kwargs)
                    );
                    this.send({serial:this.getNextFarcallSN(), ref:obj.serial, result:res});
                }
            }
        });
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    async farcall(cmd, args, kwargs, onComplete = null) {
        let id = this.getNextFarcallSN();
        if (onComplete != null)
            this.callbacksFarcall.set(id, onComplete);
        this.workerImpl._send({
            serial: id,
            cmd: cmd,
            args: await DefaultBiMapper.getInstance().serialize(args),
            kwargs: await DefaultBiMapper.getInstance().serialize(kwargs)
        });
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
    let cmd = obj.cmd;
    if (cmd && wrkInner.export[cmd]) {
        let res = await wrkInner.export[cmd](obj.args, obj.kwargs);
        wrkInner.send({serial:wrkInner.getNextFarcallSN(), ref:obj.serial, result:res});
    } else if (obj.result !== undefined) {
        let ref = obj.ref;
        if (wrkInner.callbacksFarcall.has(ref)) {
            wrkInner.callbacksFarcall.get(ref)(obj.result);
            wrkInner.callbacksFarcall.delete(ref);
        }
    }
}
wrkInner.farcall = (cmd, args, kwargs, onComplete = null) => {
    let id = wrkInner.getNextFarcallSN();
    if (onComplete != null)
        wrkInner.callbacksFarcall.set(id, onComplete);
    wrkInner.send({serial:id, cmd:cmd, args:args, kwargs:kwargs});
}
`;

Object.freeze(wrk.__getWorker);
Object.freeze(wrk.WorkerHandle);
Object.freeze(wrk.getWorker);
Object.freeze(wrk);

module.exports = wrk;
