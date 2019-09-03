/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;

const t = require("tools");

class UBotResultCache {

    constructor(maxAge) {
        this.records = new t.GenericMap();
        this.maxAge = maxAge;
        this.cleanerExecutor = new ExecutorWithFixedPeriod(() => this.cleanUp(), 5000);
        this.cleanerExecutor.run();
    }

    cleanUp() {
        let now = Math.floor(Date.now() / 1000);
        for (let r of this.records.values())
            r.checkExpiration(now);
    }

    shutdown() {
        this.cleanerExecutor.cancel();
    }

    get(recordId) {
        let i = this.records.get(recordId);
        if (i != null && i.result == null)
            throw new Error("cache: record with empty result");
        return i != null ? i.result : null;
    }

    put(recordId, result) {
        // this will plainly override current if any
        new Record(recordId, result, this);
    }

    get size() {
        return this.records.size;
    }
}

class Record {
    constructor(recordId, result, resultCache) {
        this.resultCache = resultCache;
        this.recordId = recordId;
        this.result = result;
        this.expiresAt = Math.floor(Date.now() / 1000) + this.resultCache.maxAge;
        this.resultCache.records.set(recordId, this);
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.resultCache.records.delete(this.recordId);
    }

}

module.exports = {UBotResultCache};