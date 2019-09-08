/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

wrk.Worker = class {
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

wrk.createWorker = function(accessLevel) {
    console.log("wrk.createWorker");
    return new Promise(resolve => {
        wrk.__createWorker(accessLevel, workerImpl => {
            resolve(new wrk.Worker(workerImpl));
        });
    });
};

module.exports = wrk;
