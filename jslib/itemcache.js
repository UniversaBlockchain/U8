import * as trs from "timers";

const ex = require("exceptions");

class ItemCache {

    constructor(maxAge) {
        this.records = new Map();
        this.maxAge = maxAge;
        this.cleanerTimerCallback = () => {
            this.cleanUp();
            this.cleanerTimer = trs.timeout(5000, this.cleanerTimerCallback);
        };
        this.cleanerTimer = trs.timeout(5000, this.cleanerTimerCallback);
    }

    cleanUp() {
        // we should avoid creating an object for each check:
        let now = Math.floor(Date.now() / 1000);
        for (let r of this.records.values())
            r.checkExpiration(now);
    }

    shutdown() {
        this.cleanerTimer.cancel();
    }

    get(itemId) {
        let i = this.records.get(itemId);
        if(i != null && i.item == null)
            throw new Error("cache: record with empty item");
        return i != null ? i.item : null;
    }

    getResult(itemId) {
        let r = this.records.get(itemId);
        if(r != null && r.item == null)
            throw new Error("cache: record with empty item");
        return r != null ? r.result : null;
    }

    put(item, result) {
        // this will plainly override current if any
        let r = new Record(item, result); //TODO
    }

    update(itemId, result) {
        let r = this.records.get(itemId);
        if((r != null) && (r.item == null))
            throw new Error("cache: record with empty item");
        if(r != null) {
            r.result = result;
        }
    }
}

class Record {
    constructor(item, result, itemCache) {
        this.itemCache = itemCache;
        this.expiresAt = Math.floor(Date.now() / 1000) + ItemCache.maxAge;
        this.item = item;
        this.result = result;
        ItemCache.records.set(this.item.id, this);
    }

    checkExpiration(now) {
        if( this.expiresAt < now) { //TODO
            this.itemCache.records.delete(this.item.id);
        }
    }
}

//module.exports = {ItemCache};