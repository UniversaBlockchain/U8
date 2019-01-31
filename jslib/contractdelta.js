const bs = require("biserializable");
const BossBiMapper = require("bossbimapper").BossBiMapper;
const t = require("tools");
const ErrorRecord = require("errors").ErrorRecord;
const Errors = require("errors").Errors;
const Delta = require("deltas").Delta;
const QuantiserException = require("quantiser").QuantiserException;
const MapDelta = require("deltas").MapDelta;
const SplitJoinPermission = require("permissions").SplitJoinPermission;

function ContractDelta(existing, changed) {
    this.existing = existing;
    this.changed = changed;
    this.stateDelta = null;
    this.stateChanges = null;
    this.revokingItems = null;

}

ContractDelta.insignificantKeys = new Set(["created_at", "created_by", "revision", "branch_id", "parent", "origin"]);


ContractDelta.prototype.check = function() {
    //try {
        console.log("SSSS");
        console.log(this.existing != null);
        console.log(this.changed != null);
        let s1 = BossBiMapper.getInstance().serialize(this.existing);
        let s2 = BossBiMapper.getInstance().serialize(this.changed)

        console.log(s1 != null);
        console.log(s2 != null);

        let rootDelta = Delta.between(null,s1, s2);
        this.stateDelta = rootDelta.changes.state;

        if (rootDelta.changes.hasOwnProperty("definition")) {
            this.changed.errors.push(new ErrorRecord(Errors.ILLEGAL_CHANGE, "definition", "definition must not be changed"));
        }

        let allowedRootChanges = 1;
        if (rootDelta.changes.hasOwnProperty("api_level"))
            allowedRootChanges++;

        if (rootDelta.changes.hasOwnProperty("transactional"))
            allowedRootChanges++;

        if (Object.keys(rootDelta.changes).length > allowedRootChanges)
            this.changed.errors.push(new ErrorRecord(Errors.ILLEGAL_CHANGE, "root", "root level changes are forbidden except the state"));

        // check only permitted changes in data
        this.checkStateChange();
//    } catch (e) {
//        if(e instanceof QuantiserException)
//            throw e;
//
//        this.changed.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "failed to compare, structure is broken or not supported:" + e));
//    }

};

ContractDelta.prototype.checkStateChange = function() {
    this.stateChanges = this.stateDelta.changes;
    this.revokingItems = new Set(this.changed.revokingItems);
    delete this.stateChanges.created_by;

    // todo: check siblings have different and proper branch ids
    delete this.stateChanges.branch_id;

    // todo: these changes should be already checked
    delete this.stateChanges.parent;
    delete this.stateChanges.origin;


    let found = false;
    for(let k of Object.keys(this.stateChanges)) {
        if(!ContractDelta.insignificantKeys.has(k)) {
            found = true;
            break;
        }
    }

    if ( !found ) {
        this.changed.errors.push(new ErrorRecord(Errors.BADSTATE, "", "new state is identical"));
    }


    if (!this.stateChanges.hasOwnProperty("revision"))
        this.changed.errors.push(new ErrorRecord(Errors.BAD_VALUE, "state.revision", "is not incremented"));
    else {
        if (this.stateChanges.revision.oldValue + 1 !== this.stateChanges.revision.newValue)
            this.changed.errors.push(new ErrorRecord(Errors.BAD_VALUE, "state.revision", "wrong revision number"));
        delete this.stateChanges.revision;
    }

    // if time is changed, it must be past:
    if (this.stateChanges.hasOwnProperty("created_at")) {

        if (this.stateChanges.created_at.newValue.getTime() <= this.stateChanges.created_at.oldValue.getTime())
            this.changed.errors.push(new ErrorRecord(Errors.BAD_VALUE, "state.created_at", "new creation datetime is before old one"));

        delete this.stateChanges.created_at;
    }

    this.excludePermittedChanges();

    // Some changes coud be empty trees, cleared by permissions, which can not remove root
    // entries, so we should check them all:
    for(let field of Object.keys(this.stateChanges)) {
        if (!this.stateChanges[field].isEmpty()) {
            let reason = "";
            if (this.stateChanges[field] instanceof MapDelta)
                reason = " in " + JSON.stringify(Object.keys(this.stateChanges[field].changes));
            this.changed.errors.push(new ErrorRecord(Errors.FORBIDDEN,
                "state." + field,
                "not permitted changes" + reason+": " + this.stateChanges[field].oldValue+" -> " + this.stateChanges[field].newValue));
        }
    }
};

ContractDelta.prototype.excludePermittedChanges = function() {
    let checkingKeys = this.changed.effectiveKeys.keys();
    for (let permissions of  this.existing.definition.permissions.values()) {
        let permissionQuantized = false;
        for (let permission of permissions) {
            if (permission.isAllowedForKeys(checkingKeys)) {
                if(!permissionQuantized) {
                    this.changed.quantiser.addWorkCost(QuantiserProcesses.PRICE_APPLICABLE_PERM);
                    if(permission instanceof SplitJoinPermission) {
                        this.changed.quantiser.addWorkCost(QuantiserProcesses.PRICE_SPLITJOIN_PERM);
                    }
                    permissionQuantized = true;
                }
                permission.checkChanges(this.existing, this.changed, this.stateChanges,this.revokingItems,checkingKeys);
            }
        }
    }
}

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {ContractDelta};