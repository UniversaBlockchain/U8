//const Ledger = require("ledger").Ledger;
const ex = require("exceptions");
const ItemState = require("itemstate").ItemState;

class StateRecord {
    constructor(ledger) {
        if (ledger == null)
            throw new ex.IllegalStateError("connect to null ledger");

        this.ledger = ledger;
        this.dirty = false;
        this.recordId = 0;
        this.lockedByRecordId = 0;

        this.createdAt = new Date();
        this.expiresAt = new Date();
        this.expiresAt.setTime((Math.floor(this.expiresAt.getTime() / 1000) + 300) * 1000);
        this.createdAt.setMilliseconds(0);
        this.expiresAt.setMilliseconds(0);

        this.id = null;
        this.state = ItemState.UNDEFINED;
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
        if (result.expiresAt == null) {
            // todo: what we should do with items without expiresAt?
            result.expiresAt = new Date();
            result.expiresAt.setTime((Math.floor(result.createdAt.getTime() / 1000) + 90 * 24 * 3600) * 1000);
            result.expiresAt.setMilliseconds(0);
        }

        return result;
    }

    toString() {
        return "State<"+this.id+"/"+this.recordId+":"+this.state.val+":"+this.createdAt+"/"+this.expiresAt+">"
    }

    isExpired() {
        return this.expiresAt != null && this.expiresAt.getTime() < new Date().getTime();
    }

    lockToRevoke(idToRevoke) {
        if (this.state !== ItemState.PENDING)
            throw new ex.IllegalStateError("only pending records are allowed to lock others");

        let lockedRecord = this.ledger.getRecord(idToRevoke);
        if (lockedRecord == null)
            return null;

        switch (lockedRecord.state) {
            case ItemState.LOCKED:
                // if it is locked by us, it's ok
                if( !this.checkLockedRecord(lockedRecord) )
                    return null;
                break;
            case ItemState.APPROVED:
                // it's ok, we can lock it
                break;
            default:
                // wrong state, can't lock it
                return null;
        }

        lockedRecord.lockedByRecordId = this.recordId;
        lockedRecord.state = ItemState.LOCKED;
        lockedRecord.save();

        return lockedRecord;
    }

    checkLockedRecord(lockedRecord) {
        // It is locked bu us

        if(lockedRecord.lockedByRecordId === this.recordId )
            return true;

        let currentOwner = this.ledger.getLockOwnerOf(lockedRecord);
        // we can acquire the lock - it is dead
        if( currentOwner == null )
            return true;

        // valid lock
        if( currentOwner.state.isPending )
            return false;

        // This section process data structure errors than can opccur due to unhandled exceptions, data corruption and like
        // in a safe manner:

        // The locker is bad?
        if( currentOwner.state === ItemState.DECLINED || currentOwner.state === ItemState.DISCARDED )
            return true;

        // report inconsistent data. We are not 100% sure this lock could be reacquired, further exploration
        // needed. As for now, we can't lock it.
        return false;
    }

    unlock() {
        switch (this.state) {
            case ItemState.LOCKED:
                this.state = ItemState.APPROVED;
                this.lockedByRecordId = 0;
                this.save();
                break;
            case ItemState.LOCKED_FOR_CREATION:
                this.destroy();
                break;
            default:
                break;
        }
        return this;
    }

    revoke() {
        if (this.state === ItemState.LOCKED) {
            this.state = ItemState.REVOKED;
            this.save();
        } else {
            throw new ex.IllegalStateError("can't archive record that is not in the locked state");
        }

    }

    approve() {
        if (this.state.isPending) {
            this.state = ItemState.APPROVED;
            this.save();
        } else
            throw new ex.IllegalStateError("attempt to approve record that is not pending: " + state);

    }

    async createOutputLockRecord(id) {
        if (this.recordId === 0)
            throw new ex.IllegalStateError("the record must be created");
        if (this.state !== ItemState.PENDING)
            throw new ex.IllegalStateError("wrong state to createOutputLockRecord: " + state);

        let newRecord = await this.ledger.getRecord(id);
        if (newRecord != null) {
            // if it is not locked for approval - failure
            if (newRecord.state !== ItemState.LOCKED_FOR_CREATION)
                return null;
            // it it is locked by us, ok
            return newRecord.lockedByRecordId === this.recordId ? newRecord : null;
        }

        return this.ledger.createOutputLockRecord(this.recordId, id);
    }

    markTestRecord() {
        return this.ledger.markTestRecord(this.id);
    }

    reload() {
        if (this.recordId === 0)
            throw new ex.IllegalStateError("can't reload record without recordId (new?)");
        return this.ledger.reload(this);
    }

    save() {
        return this.ledger.save(this);
    }

    destroy() {
        return this.ledger.destroy(this);
    }
}

module.exports = {StateRecord};
