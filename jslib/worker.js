/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

wrk.WorkerHandle = class {
    constructor(workerImpl) {
        this.workerImpl = workerImpl;
    }

    onReceive(block) {
        block({});
    }

    send(obj) {
        this.workerImpl._send(obj);
    }

    async close() {
    }
};

wrk.createWorker = function(accessLevel, workerSrc) {
    console.log("wrk.createWorker");
    return new Promise(resolve => {
        wrk.__createWorker(accessLevel, workerSrc, workerImpl => {
            resolve(new wrk.WorkerHandle(workerImpl));
        });
    });
};

module.exports = wrk;
