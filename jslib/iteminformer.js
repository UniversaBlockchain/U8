/**
 * The way to attach some information to the item to the client software, mainly, error traces.
 */
class ItemInformer {

    constructor() {
        this.records = new t.GenericMap();
    }

    inform(item) {
        let records = this.getRecord(item.id).errorRecords;
        records.splice(records.length, 0, ...item.errors);
    }

    cleanUp() {
        // we should avoid creating an object for each check:
        let now = Math.floor(Date.now() / 1000);
        for (let r of this.records.values())
            r.checkExpiration(now);
    }

    getRecord(itemId) {
        let r = this.records.get(itemId);
        if (r == null) {
            r = new Record(itemId);
            this.records.set(itemId, r);
        }
        return r;
    }

    takeFor(id) {
        return this.records.remove(id);
    }
}

class Record {

    constructor(id, itemInformer) {
        this.iteminformer = itemInformer;
        this.hashId = id;
        this.expiresAt = new Date((Date.now() / 1000 + 300) * 1000);
        this.errorRecords = [];
        this.messages = [];
    }

    checkExpiration(now) {
        if (this.expiresAt < now)
            this.iteminformer.records.delete(this);
    }

    resetExpiration() {
        this.expiresAt = new Date((Date.now() / 1000 + 300) * 1000);
    }

    addError(er) {
        this.resetExpiration();
        this.errorRecords.push(er);
    }

    addMessage(er) {
        this.resetExpiration();
        this.errorRecords.push(er);
    }
}