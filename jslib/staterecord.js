const Config = require("config").Config;
const ex = require("exceptions");
const ItemState = require("itemstate").ItemState;

class StateRecord {
    constructor(ledger) {
        if (ledger == null)
            throw new ex.IllegalStateError("connect to null ledger");

        this.ledger = ledger;
        this.recordId = 0;
        this.lockedByRecordId = 0;

        this.createdAt = new Date();
        this.expiresAt = new Date();
        this.expiresAt.setMinutes(this.expiresAt.getMinutes() + 5);
        this.createdAt.setMilliseconds(0);
        this.expiresAt.setMilliseconds(0);

        this.id = null;
        this.state = ItemState.UNDEFINED;

        this.saveNotification = null;
        this.destroyNotification = null;
    }

    copy(record) {
        this.ledger = record.ledger;
        this.recordId = record.recordId;
        this.lockedByRecordId = record.lockedByRecordId;
        this.id = record.id;
        this.state = record.state;
        this.createdAt = new Date(record.createdAt);
        this.expiresAt = new Date(record.expiresAt);
    }

    static initFrom(ledger, row) {
        let result = new StateRecord(ledger);

        if (row == null)
            throw new ex.IllegalArgumentError("Error initialization StateRecord: row is null");

        result.recordId = row[0];
        result.id = crypto.HashId.withDigest(row[1]);
        result.state = ItemState.byOrdinal.get(row[2]);
        result.lockedByRecordId = row[3];
        if (result.lockedByRecordId == null)
            result.lockedByRecordId = 0;

        result.createdAt = t.convertToDate(row[4]);
        result.expiresAt = t.convertToDate(row[5]);

        return result;
    }

    toString() {
        return "State<"+this.id+"/"+this.recordId+":"+this.state.val+":"+this.createdAt+"/"+this.expiresAt+">"
    }

    isExpired() {
        return this.expiresAt != null && this.expiresAt.getTime() < new Date().getTime();
    }

    /**
     * Lock the item with a given id as being revoked by this one. Check this state, looks for the record to lock and
     * also checks its state first.
     * <p>
     * Note that the operation is allowed only to the records in {@see ItemState#PENDING}. If the item is already
     * checked locally and is therefore in PENDING_NEGATIVE or PENDING_POSITIVE state, it can not lock any other items.
     *
     * @param {HashId} idToRevoke is id for item should be revoked
     * @return {StateRecord} locked record id null if it could not be node
     */
    async lockToRevoke(idToRevoke) {
        if (this.state !== ItemState.PENDING)
            throw new ex.IllegalStateError("only pending records are allowed to lock others");

        let lockedRecord = await this.ledger.getRecord(idToRevoke);
        if (lockedRecord == null)
            return null;

        let targetState = ItemState.LOCKED;

        switch (lockedRecord.state) {
            case ItemState.APPROVED:
                // it's ok, we can lock it
                break;
            case ItemState.LOCKED_FOR_CREATION:
                // the only possible situation is that records is locked by us.
                if (lockedRecord.lockedByRecordId !== this.recordId)
                    return null;
                targetState = ItemState.LOCKED_FOR_CREATION_REVOKED;
                break;
            default:
                // wrong state, can't lock it
                return null;
        }

        lockedRecord.lockedByRecordId = this.recordId;
        lockedRecord.state = targetState;
        await lockedRecord.save();

        return lockedRecord;
    }

    async lockForCreate(idToCreate) {
        if (this.recordId === 0)
            throw new ex.IllegalStateError("the record must be created");
        if (this.state !== ItemState.PENDING)
            throw new ex.IllegalStateError("wrong state to lockForCreate: " + this.state.val);

        if (await this.ledger.getRecord(idToCreate) != null)
            return null;

        return await this.ledger.findOrCreate(idToCreate, ItemState.LOCKED_FOR_CREATION, this.recordId);
    }

    async unlock() {
        switch (this.state) {
            case ItemState.LOCKED:
                this.state = ItemState.APPROVED;
                this.lockedByRecordId = 0;
                await this.save();
                break;
            case ItemState.LOCKED_FOR_CREATION:
            case ItemState.LOCKED_FOR_CREATION_REVOKED:
                await this.destroy();
                break;
            default:
                break;
        }
        return this;
    }

    async revoke(force = false) {
        if (this.state === ItemState.LOCKED || this.state === ItemState.LOCKED_FOR_CREATION_REVOKED ||
            (force && (this.state.isPending || this.state === ItemState.UNDEFINED || this.state === ItemState.APPROVED))) {

            this.state = ItemState.REVOKED;
            this.expiresAt = new Date();
            this.expiresAt.setSeconds(this.expiresAt.getSeconds() + Config.revokedItemExpiration);
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt to revoke record from wrong state: " + this.state.val);
    }

    async approve(newExpiresAt = undefined, force = false) {
        if (this.state.isPending || this.state === ItemState.LOCKED_FOR_CREATION ||
            (force && (this.state === ItemState.UNDEFINED || this.state === ItemState.LOCKED || this.state === ItemState.APPROVED))) {

            this.state = ItemState.APPROVED;
            if (newExpiresAt !== undefined)
                this.expiresAt = newExpiresAt;
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt to approve record from wrong state: " + this.state.val);
    }

    async decline(force = false) {
        if (this.state.isPending || (force && this.state === ItemState.UNDEFINED)) {
            this.state = ItemState.DECLINED;
            this.expiresAt = new Date();
            this.expiresAt.setSeconds(this.expiresAt.getSeconds() + Config.declinedItemExpiration);
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt to decline record from wrong state: " + this.state.val);
    }

    async setUndefined(force = false) {
        if (this.state.isPending || this.isExpired() ||
            (force && (this.state === ItemState.DECLINED || this.state === ItemState.REVOKED || this.state === ItemState.APPROVED))) {

            this.state = ItemState.UNDEFINED;
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt setUndefined record from wrong state: " + this.state.val);
    }

    async setPendingPositive() {
        if (this.state === ItemState.PENDING) {
            this.state = ItemState.PENDING_POSITIVE;
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt setPendingPositive record from wrong state: " + this.state.val);
    }

    async setPendingNegative() {
        if (this.state === ItemState.PENDING) {
            this.state = ItemState.PENDING_NEGATIVE;
            await this.save();
        } else
            throw new ex.IllegalStateError("attempt setPendingNegative record from wrong state: " + this.state.val);
    }

    markTestRecord() {
        return this.ledger.markTestRecord(this.id);
    }

    async reload() {
        if (this.recordId === 0)
            throw new ex.IllegalStateError("can't reload record without recordId (new?)");

        let result = await this.ledger.reload(this);
        if (result == null)
            throw new ex.IllegalStateError("record not found");

        this.copy(result);

        return this;
    }

    save(con) {
        if (this.saveNotification != null)
            this.saveNotification(this);
        return this.ledger.save(this, con);
    }

    destroy(con) {
        if (this.destroyNotification != null)
            this.destroyNotification(this);
        return this.ledger.destroy(this, con);
    }
}

module.exports = {StateRecord};
