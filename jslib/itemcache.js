/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;
const ItemState = require('itemstate').ItemState;

const t = require("tools");

class ItemCache {

    constructor(maxAge) {
        this.records = new t.GenericMap();
        this.maxAge = maxAge;
        this.cleanerExecutor = new ExecutorWithFixedPeriod(() => this.cleanUp(), 5000);
        this.cleanerExecutor.run();
    }

    cleanUp() {
        // we should avoid creating an object for each check:
        let now = Math.floor(Date.now() / 1000);
        for (let r of this.records.values())
            r.checkExpiration(now);
    }

    shutdown() {
        this.cleanerExecutor.cancel();
    }

    get(itemId) {
        let r = this.records.get(itemId);
        if (r != null && r.item == null)
            throw new Error("cache: record with empty item");
        return r != null ? r.item : null;
    }

    getResult(itemId) {
        let r = this.records.get(itemId);
        if (r != null && r.item == null)
            throw new Error("cache: record with empty item");
        return r != null ? r.result : null;
    }

    put(item, result, recordToSubscribe = undefined) {
        // this will plainly override current if any
        new Record(item, result, this);

        if (recordToSubscribe != null)
            this.subscribeStateRecord(recordToSubscribe);
    }

    update(itemId, result) {
        let r = this.records.get(itemId);
        if (r != null) {
            if (r.item == null)
                throw new Error("cache: record with empty item");

            r.result = result;
        }

        return r;
    }

    subscribeStateRecord(stateRecord) {
        stateRecord.saveNotification = (record) => {
            let itemResult = this.getResult(record.id);

            if (itemResult != null) {
                itemResult.state = record.state;
                itemResult.expiresAt = record.expiresAt;
                itemResult.lockedById = record.lockedByRecordId;
            }
        };

        stateRecord.destroyNotification = (record) => {
            let itemResult = this.getResult(record.id);

            if (itemResult != null) {
                itemResult.state = ItemState.UNDEFINED;
                itemResult.expiresAt = record.expiresAt;
                itemResult.lockedById = record.lockedByRecordId;
            }
        };
    }

    get size() {
        return this.records.size;
    }
}

class Record {
    constructor(item, result, itemCache) {
        this.itemCache = itemCache;
        this.expiresAt = Math.floor(Date.now() / 1000) + this.itemCache.maxAge;
        this.item = item;
        this.result = result;
        this.itemCache.records.set(this.item.id, this);
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.itemCache.records.delete(this.item.id);
    }
}

module.exports = {ItemCache};