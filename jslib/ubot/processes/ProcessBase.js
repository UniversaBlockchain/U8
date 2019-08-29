/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

class ProcessBase {
    constructor(processor, onReady) {
        this.pr = processor;
        this.onReady = onReady;
        this.currentTask = null;
    }

    start() {
        throw new Error("ProcessBase.start() not implemented");
    }

    onNotify(notification) {
        // silently do nothing
    }
}

module.exports = {ProcessBase};