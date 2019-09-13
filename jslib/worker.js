/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

wrk.WorkerHandle = class {
    constructor(workerImpl) {
        this.workerImpl = workerImpl;
        this.onReceiveCallback = obj => {}
        this.nextJsonRpcId = 1;
        this.callbacks = new Map();
    }

    onReceive(block) {
        this.onReceiveCallback = block;
    }

    startJsonRpcCallbacks() {
        this.onReceive((obj) => {
            let id = obj.id;
            if (this.callbacks.has(id)) {
                this.callbacks.get(id)(obj.result);
                this.callbacks.delete(id);
            }
        });
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    sendJsonRpc(method, params, onComplete = null) {
        let id = this.nextJsonRpcId;
        if (onComplete != null)
            this.callbacks.set(id, onComplete);
        this.workerImpl._send({jsonrpc:"2.0", method:method, params:params, id:id});
    }

    release() {
        this.workerImpl._release();
    }

    async close() {
    }

    getNextJsonRpcId() {
        let res = this.nextJsonRpcId;
        ++res;
        if (res >= Number.MAX_SAFE_INTEGER)
            res = 1;
        return res;
    }
};

wrk.createWorker = function(accessLevel, workerSrc) {
    console.log("wrk.createWorker");
    return new Promise(resolve => {
        wrk.__createWorker(accessLevel, workerSrc, workerImpl => {
            let w = new wrk.WorkerHandle(workerImpl);
            w.workerImpl._setOnReceive(obj => w.onReceiveCallback(obj));
            resolve(w);
        });
    });
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

wrk.jsonRpcWrapper = `
wrk.export = {};
wrk.onReceive = (obj) => {
    let method = obj.method;
    if (wrk.export[method]) {
        let res = wrk.export[method](obj.params);
        if (res !== undefined)
            wrk.send({jsonrpc:"2.0", result:res, id:obj.id});
    }
}
`;

module.exports = wrk;
