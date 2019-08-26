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

    get(hash) {
        let i = this.records.get(hash);
        if (i != null && i.result == null)
            throw new Error("cache: record with empty result");
        return i != null ? i.result : null;
    }

    put(hash, result) {
        // this will plainly override current if any
        new Record(hash, result, this);
    }

    get size() {
        return this.records.size;
    }
}

class Record {
    constructor(hash, result, resultCache) {
        this.resultCache = resultCache;
        this.hash = hash;
        this.result = result;
        this.expiresAt = Math.floor(Date.now() / 1000) + this.resultCache.maxAge;
        this.resultCache.records.set(hash, this);
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.resultCache.records.delete(this.hash);
    }

}

module.exports = {UBotResultCache};