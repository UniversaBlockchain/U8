/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

class ProcessBase {
    constructor(processor, onReady, onFailed) {
        this.pr = processor;
        this.onReady = onReady;
        this.onFailed = onFailed;
    }

    start() {
        throw new Error("ProcessBase.start() not implemented");
    }

    onNotify(notification) {
        // silently do nothing
    }
}

module.exports = {ProcessBase};