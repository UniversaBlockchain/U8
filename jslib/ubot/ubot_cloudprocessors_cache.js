/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;

const t = require("tools");

class UBotCloudProcessorsCache {

    constructor(ubot, maxAge) {
        this.records = new t.GenericMap();
        this.ubot = ubot;
        this.maxAge = maxAge;
        this.cleanerExecutor = new ExecutorWithFixedPeriod(() => this.cleanUp(), 20000);
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

    put(id) {
        // this will plainly override current if any
        new Record(id, this);
    }

    get size() {
        return this.records.size;
    }
}

class Record {
    constructor(id, cache) {
        this.cache = cache;
        this.id = id;
        this.expiresAt = Math.floor(Date.now() / 1000) + this.cache.maxAge;
        this.cache.records.set(id, this);
    }

    checkExpiration(now) {
        if (this.expiresAt < now) {
            this.ubot.processors.delete(this.id);
            this.cache.records.delete(this.id);
        }
    }

}

module.exports = {UBotCloudProcessorsCache};