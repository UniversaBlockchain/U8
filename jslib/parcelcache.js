const ExecutorWithFixedPeriod = require("executorservice").ExecutorWithFixedPeriod;

const t = require("tools");

class ParcelCache {

    constructor(maxAge) {
        this.records = new t.GenericMap();
        this.maxAge = maxAge;
        this.cleanerExecutor = new ExecutorWithFixedPeriod(() => this.cleanUp(), 5000).run();
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
        let i = this.records.get(itemId);
        if (i != null && i.parcel == null)
            throw new Error("cache: record with empty item");
        return i != null ? i.parcel : null;
    }

    put(parcel) {
        // this will plainly override current if any
        new Record(parcel, this);
    }

    get size() {
        return this.records.size;
    }
}

class Record {
    constructor(parcel, parcelCache) {
        this.parcelCache = parcelCache;
        this.parcel = parcel;
        this.expiresAt = Math.floor(Date.now() / 1000) + this.parcelCache.maxAge;
        this.parcelCache.records.set(this.parcel.hashId, this);
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.parcelCache.records.delete(this.parcel.hashId);
    }

}

module.exports = {ParcelCache};
