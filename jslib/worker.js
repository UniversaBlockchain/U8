/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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
                    let res = await this.export[cmd](obj.args, obj.kwargs);
                    this.send({serial:this.getNextFarcallSN(), ref:obj.serial, result:res});
                }
            }
        });
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    farcall(cmd, args, kwargs, onComplete = null) {
        let id = this.getNextFarcallSN();
        if (onComplete != null)
            this.callbacksFarcall.set(id, onComplete);
        this.workerImpl._send({serial:id, cmd:cmd, args:args, kwargs:kwargs});
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

wrk.getWorker = function(accessLevel, workerSrc) {
    return new Promise(resolve => {
        wrk.__getWorker(accessLevel, workerSrc, workerImpl => {
            let w = new wrk.WorkerHandle(workerImpl);
            w.workerImpl._setOnReceive(obj => w.onReceiveCallback(obj));
            resolve(w);
        });
    });
};

wrk.farcallWrapper = `
wrk.export = {};
wrk.nextFarcallSN = 0;
wrk.callbacksFarcall = new Map();
wrk.getNextFarcallSN = () => {
    let res = wrk.nextFarcallSN;
    ++wrk.nextFarcallSN;
    if (wrk.nextFarcallSN >= Number.MAX_SAFE_INTEGER)
        wrk.nextFarcallSN = 0;
    return res;
};
wrk.onReceive = async (obj) => {
    let cmd = obj.cmd;
    if (cmd && wrk.export[cmd]) {
        let res = await wrk.export[cmd](obj.args, obj.kwargs);
        wrk.send({serial:wrk.getNextFarcallSN(), ref:obj.serial, result:res});
    } else if (obj.result !== undefined) {
        let ref = obj.ref;
        if (wrk.callbacksFarcall.has(ref)) {
            wrk.callbacksFarcall.get(ref)(obj.result);
            wrk.callbacksFarcall.delete(ref);
        }
    }
}
wrk.farcall = (cmd, args, kwargs, onComplete = null) => {
    let id = wrk.getNextFarcallSN();
    if (onComplete != null)
        wrk.callbacksFarcall.set(id, onComplete);
    wrk.send({serial:id, cmd:cmd, args:args, kwargs:kwargs});
}
`;

module.exports = wrk;
