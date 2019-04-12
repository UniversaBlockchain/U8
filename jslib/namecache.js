import * as trs from "timers";

/**
 * Class-helper for concurrency work with UNS1 ledger functions.
 */
class NameCache {
    static NAME_PREFIX = "n_";
    static ORIGIN_PREFIX = "o_";
    static ADDRESS_PREFIX = "a_";

    constructor(maxAge) {
        this.maxAge = maxAge;
        this.cleanerTimerCallback = () => {
            this.cleanUp();
            this.cleanerTimer = trs.timeout(5000, this.cleanerTimerCallback);
        };
        this.cleanerTimer = trs.timeout(5000, this.cleanerTimerCallback);
        this.records = new Map();
    }

    cleanUp() {
        let now = Math.floor(Date.now() / 1000);
        for (let [n,r] of this.records)
            r.checkExpiration(now);
    }

    shutdown() {
        this.cleanerTimer.cancel();
    }

    lockStringValue(name_reduced) {
        if (this.records.has(name_reduced))
            return false;

        this.records.set(name_reduced, new Record(name_reduced, this));

        return true;
    }

    unlockStringValue(name_reduced) {
        this.records.delete(name_reduced);
    }

    lockStringList(prefix, stringList) {
        let unavailableStrings = [];
        let lockedByThisCall = [];

        stringList.forEach(str => {
            let strWithPrefix = prefix + str;
            if (this.lockStringValue(strWithPrefix))
                lockedByThisCall.push(strWithPrefix);
            else
                unavailableStrings.push(str);
        });

        if (unavailableStrings.length > 0)
            lockedByThisCall.forEach(rn => this.unlockStringValue(rn));

        return unavailableStrings;
    }

    unlockStringList(prefix, stringList) {
        stringList.forEach(str => this.unlockStringValue(prefix + str));
    }

    lockNameList(reducedNameList) {
        return this.lockStringList(NameCache.NAME_PREFIX, reducedNameList);
    }

    unlockNameList(reducedNameList) {
        this.unlockStringList(NameCache.NAME_PREFIX, reducedNameList);
    }

    lockOriginList(originList) {
        let stringList = [];
        originList.forEach(origin => stringList.push(origin.base64));

        return this.lockStringList(NameCache.ORIGIN_PREFIX, stringList);
    }

    unlockOriginList(originList) {
        let stringList = [];
        originList.forEach(origin => stringList.push(origin.base64));

        this.unlockStringList(NameCache.ORIGIN_PREFIX, stringList);
    }

    lockAddressList(addressList) {
        return this.lockStringList(NameCache.ADDRESS_PREFIX, addressList);
    }

    unlockAddressList(addressList) {
        this.unlockStringList(NameCache.ADDRESS_PREFIX, addressList);
    }
}

/**
 * Name record for UNS1.
 */
class Record {
    constructor(name_reduced, nameCache) {
        this.nameCache = nameCache;
        this.expiresAt = Math.floor(Date.now() / 1000) + nameCache.maxAge;
        this.name_reduced = name_reduced;
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.nameCache.records.delete(this.name_reduced);
    }
}

module.exports = {NameCache};