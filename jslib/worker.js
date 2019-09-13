/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

wrk.WorkerHandle = class {
    constructor(workerImpl) {
        this.workerImpl = workerImpl;
        this.onReceiveCallback = obj => {}
        this.nextJsonRpcId = 1;
        this.callbacks = new Map();
        this.export = {};
    }

    onReceive(block) {
        this.onReceiveCallback = block;
    }

    startJsonRpcCallbacks() {
        this.onReceive(async (obj) => {
            let id = obj.id;
            if (obj.result !== undefined) {
                if (this.callbacks.has(id)) {
                    this.callbacks.get(id)(obj.result);
                    this.callbacks.delete(id);
                }
            } else {
                let method = obj.method;
                if (method && this.export[method]) {
                    let res = await this.export[method](obj.params);
                    if (res !== undefined)
                        this.send({jsonrpc:"2.0", result:res, id:obj.id});
                }
            }
        });
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    sendJsonRpc(method, params, onComplete = null) {
        let id = this.getNextJsonRpcId();
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
        ++this.nextJsonRpcId;
        if (this.nextJsonRpcId >= Number.MAX_SAFE_INTEGER)
            this.nextJsonRpcId = 1;
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
wrk.nextJsonRpcId = 1;
wrk.callbacks = new Map();
wrk.getNextJsonRpcId = () => {
    let res = wrk.nextJsonRpcId;
    ++wrk.nextJsonRpcId;
    if (wrk.nextJsonRpcId >= Number.MAX_SAFE_INTEGER)
        wrk.nextJsonRpcId = 1;
    return res;
};
wrk.onReceive = async (obj) => {
    let method = obj.method;
    if (method && wrk.export[method]) {
        let res = await wrk.export[method](obj.params);
        if (res !== undefined)
            wrk.send({jsonrpc:"2.0", result:res, id:obj.id});
    } else if (obj.result !== undefined) {
        let id = obj.id;
        if (wrk.callbacks.has(id)) {
            wrk.callbacks.get(id)(obj.result);
            wrk.callbacks.delete(id);
        }
    }
}
wrk.sendJsonRpc = (method, params, onComplete = null) => {
    let id = wrk.getNextJsonRpcId();
    if (onComplete != null)
        wrk.callbacks.set(id, onComplete);
    wrk.send({jsonrpc:"2.0", method:method, params:params, id:id});
}
`;

module.exports = wrk;
