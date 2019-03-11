const Ledger = require("ledger").Ledger;
const ex = require("exceptions");

function StateRecord(ledger) {
    this.ledger = ledger;
    this.dirty = false;
    this.recordId = 0;
    this.lockedByRecordId = 0;
    this.createdAt = null;
    this.expiresAt = null;
    this.id = null;
    
}


StateRecord.prototype.toString = function () {
    return "State<"+this.id+"/"+this.recordId+":"+state.val+":"+this.createdAt+"/"+this.expiresAt+">"
};



StateRecord.prototype.lockToRevoke = function (idToRevoke) {
    if(state !== ItemState.PENDING) {
        throw new ex.IllegalStateException("only pending records are allowed to lock others");
    }

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
};

StateRecord.prototype.checkLockedRecord = function (lockedRecord) {
    // It is locked bu us

    if(lockedRecord.lockedByRecordId == this.recordId )
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
};


StateRecord.prototype.unlock = function () {
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
};

StateRecord.prototype.revoke = function () {
    if (this.state === ItemState.LOCKED) {
        this.state = ItemState.REVOKED;
        this.save();
    } else {
        throw new ex.IllegalStateException("can't archive record that is not in the locked state");
    }

};

StateRecord.prototype.approve = function () {
    if (this.state.isPending) {
        this.state = ItemState.APPROVED;
        this.save();
    } else
        throw new ex.IllegalStateException("attempt to approve record that is not pending: " + state);

};


StateRecord.prototype.createOutputLockRecord = function (id) {
    if (state !== ItemState.PENDING)
        throw new ex.IllegalStateException("wrong state to createOutputLockRecord: " + state);

    let newRecord = this.ledger.getRecord(id);
    if (newRecord != null) {
        // if it is not locked for approval - failure
        if (newRecord.state !== ItemState.LOCKED_FOR_CREATION)
            return null;
        // it it is locked by us, ok
        return newRecord.lockedByRecordId === this.recordId ? newRecord : null;
    }
    newRecord = this.ledger.createOutputLockRecord(this.recordId, id);
    return newRecord;
};


StateRecord.prototype.markTestRecord = function () {
    this.ledger.markTestRecord(this.id);
};


StateRecord.prototype.reload = function () {
    if (this.recordId === 0)
        throw new ex.IllegalStateException("can't reload record without recordId (new?)");
    this.ledger.reload(this);
    return this;

};

StateRecord.prototype.save = function () {
    this.ledger.save(this);
};
