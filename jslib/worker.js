/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

wrk.WorkerHandle = class {
    constructor(workerImpl) {
        this.workerImpl = workerImpl;
        this.onReceiveCallback = obj => {}
    }

    onReceive(block) {
        this.onReceiveCallback = block;
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    release() {
        this.workerImpl._release();
    }

    async close() {
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

module.exports = wrk;
