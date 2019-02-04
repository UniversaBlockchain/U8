let bs = require("biserializable");
let dbm = require("defaultbimapper");
let t = require("tools");
let dlt = require("deltas");
let err = require("errors");
let BigDecimal  = require("big").Big;

///////////////////////////
//Permission
///////////////////////////

function Permission(name,role,params) {
    this.name = name;
    this.role = role;
    this.params = params;
    bs.BiSerializable.call(this);
}

Permission.prototype = Object.create(bs.BiSerializable.prototype);

Permission.prototype.isAllowedForKeys = function (keys) {
    return this.role.isAllowedForKeys(keys);
};



Permission.prototype.deserialize = function (data, deserializer) {
    this.name = data.name;
    this.role = deserializer.deserialize(data.role);
    this.params = data;

    for (let key in data) {
        if(key === "name")
            continue;
        if(key === "role" +
            "")
            continue;
        this[key] = data[key];
    }

};

Permission.prototype.serialize = function(serializer) {
    let result = {
        name:this.name,
        role:serializer.serialize(this.role)
    };
    if(this.params != null) {
//SWITCH TO THIS TO ENABLE BOSS BUG
//        for (let key in this.params) {
//            result[key] = this.params[key];
//        }

        for (let key of Object.keys(this.params)) {
            result[key] = this.params[key];
        }
    }
    return result;
};

Permission.prototype.equals = function(to) {
    if(this === to)
        return true;
    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;
    if(!t.valuesEqual(this.name,to.name))
        return false;
    if(!t.valuesEqual(this.role,to.role))
        return false;
    if(!t.valuesEqual(this.params,to.params))
        return false;
    return true;
};

Permission.prototype.checkChanges = function(contract, changed, stateChanges, revokingItems, keys) {

}


///////////////////////////
//ChangeNumberPermission
///////////////////////////

function ChangeNumberPermission(role,params) {
    Permission.call(this,"decrement_permission",role,params);
    if(params)
        this.initFromParams();
}


ChangeNumberPermission.prototype = Object.create(Permission.prototype);

ChangeNumberPermission.prototype.initFromParams = function() {
    this.fieldName = this.params.field_name;

    if(this.params.hasOwnProperty("min_value")) {
        this.minValue = this.params.min_value;
    } else {
        this.minValue = "0";
    }

    if(this.params.hasOwnProperty("max_value")) {
        this.maxValue = this.params.max_value;
    } else {
        this.maxValue = "2147483647";
    }

    if(this.params.hasOwnProperty("min_step")) {
        this.minStep = this.params.min_step;
    } else {
        this.minStep = "-2147483648";
    }

    if(this.params.hasOwnProperty("max_step")) {
        this.maxStep = this.params.max_step;
    } else {
        this.maxStep = "2147483647";
    }
};

ChangeNumberPermission.prototype.serialize = function(serializer) {
    this.params = {
        field_name : this.fieldName,
        max_step : this.maxStep,
        min_step : this.minStep,
        max_value : this.maxValue,
        min_value : this.minValue
    };
    return Object.getPrototypeOf(ChangeNumberPermission.prototype).serialize().call(this,serializer);
};

ChangeNumberPermission.prototype.deserialize = function (data, deserializer) {
    Object.getPrototypeOf(ChangeNumberPermission.prototype).deserialize.call(this,data,deserializer);
    this.initFromParams();
};

ChangeNumberPermission.prototype.checkChanges = function(contract, changed, stateChanges, revokingItems, keys) {
    if(!stateChanges.hasOwnProperty("data"))
        return;

    let dataChanges = stateChanges.data;
    if (dataChanges == null)
        return;
    if (dataChanges.hasOwnProperty(this.fieldName)) {
        let delta = dataChanges[this.fieldName];
        if (delta != null) {
            if (!(delta instanceof dlt.ChangedItem))
                return;

            //TODO: big decimal?
            let valueDelta = delta.newValue - delta.oldValue;

            if (valueDelta >= this.minStep && valueDelta <= this.maxStep) {
                if (delta.newValue <= this.maxValue && delta.newValue >= this.minValue)
                    delete dataChanges[this.fieldName];
            }
        }
    }
};


///////////////////////////
//ChangeOwnerPermission
///////////////////////////

function ChangeOwnerPermission(role) {
    Permission.call(this,"change_owner",role,{});
}


ChangeOwnerPermission.prototype = Object.create(Permission.prototype);

ChangeOwnerPermission.prototype.checkChanges = function(contract, changed, stateChanges, revokingItems, keys) {
    if(!stateChanges.hasOwnProperty("owner"))
        return;
    delete stateChanges.owner;
};


///////////////////////////
//ModifyDataPermission
///////////////////////////

function ModifyDataPermission(role,params) {
    Permission.call(this,"modify_data",role,params);
    if(params)
        this.initFromParams();
    this.rootFields = ["references", "expires_at"];
}


ModifyDataPermission.prototype = Object.create(Permission.prototype);

ModifyDataPermission.prototype.initFromParams = function() {
    this.fields = this.params.fields;
};

ModifyDataPermission.prototype.serialize = function(serializer) {
    let data =  Object.getPrototypeOf(ChangeNumberPermission.prototype).serialize().call(this,serializer);
    data.fields = serializer.serialize(this.fields);
    return data;
};

ModifyDataPermission.prototype.deserialize = function (data, deserializer) {
    Object.getPrototypeOf(ChangeNumberPermission.prototype).deserialize.call(this,data,deserializer);
    this.initFromParams();
};

ModifyDataPermission.prototype.acceptsChange = function(field,value) {
    if(this.fields.hasOwnProperty(field)) {
        if(this.fields[field] == null) {
            return true;
        } else {
            let acceptedValues = this.fields[field];
            for (let v in acceptedValues) {
                if (t.valuesEqual(v, value)) {
                    return true;
                }
            }
        }
    }
    return false;
};

ModifyDataPermission.prototype.checkChanges = function(contract, changed, stateChanges, revokingItems, keys) {
    if(!stateChanges.hasOwnProperty("data"))
        return;

    let dataChanges = stateChanges.get("data");
    if (dataChanges != null && dataChanges instanceof dlt.MapDelta) {
        for(let key of Object.keys(dataChanges.changes)) {
            let item = dataChanges.changes[key];
            if(this.acceptsChange(key,item.newValue)) {
                delete dataChanges.changes[key];
            }
        }
    }

    for(let rootField in this.rootFields) {
        if(stateChanges.hasOwnProperty(rootField)) {
            let item = stateChanges[rootField];
            if(this.acceptsChange("/"+rootField,item.newValue)) {
                delete stateChanges.changes[rootField];
            }
        }
    }
};


///////////////////////////
//RevokePermission
///////////////////////////

function RevokePermission(role) {
    Permission.call(this,"revoke",role,{});
}


RevokePermission.prototype = Object.create(Permission.prototype);


///////////////////////////
//SplitJoinPermission
///////////////////////////

function SplitJoinPermission(role,params) {
    Permission.call(this,"split_join",role,params);
    if(params)
        this.initFromParams();
}


SplitJoinPermission.prototype = Object.create(Permission.prototype);

SplitJoinPermission.prototype.initFromParams = function() {
    this.fieldName = this.params.field_name;

    if(this.params.hasOwnProperty("min_value")) {
        this.minValue =this.params.min_value;
    } else {
        this.minValue = "0";
    }

    if(this.params.hasOwnProperty("min_unit")) {
        this.minUnit =this.params.min_unit;
    } else {
        this.minUnit = "1e-9";
    }

    if(this.params.hasOwnProperty("join_match_fields")) {
        this.mergeFields =this.params.join_match_fields;
    } else {
        this.mergeFields = ["state.origin"];
    }
};

SplitJoinPermission.prototype.serialize = function(serializer) {
    this.params = {
        field_name : this.fieldName,
        min_unit : this.minUnit,
        min_value : this.minValue,
        join_match_fields : this.mergeFields
    };
    return Object.getPrototypeOf(ChangeNumberPermission.prototype).serialize.call(this,serializer);
};

SplitJoinPermission.prototype.deserialize = function (data, deserializer) {
    Object.getPrototypeOf(ChangeNumberPermission.prototype).deserialize.call(this,data,deserializer);
    this.initFromParams();
};


SplitJoinPermission.prototype.checkSplitJoinCase = function(changed, revokesToRemove, keys) {
    // We need to find the splitted contracts
    let splitJoinSum = new BigDecimal("0");

    let allRevoking = new t.GenericMap();

    for (let s of changed.context.siblings) {

        if (!this.isMergeable(s) || !this.validateMergeFields(changed, s) || !this.hasSimilarPermission(s, keys, false)) {
            continue;
        }
        splitJoinSum = splitJoinSum.add(new BigDecimal(s.state.data[this.fieldName]));

        for(let ri of s.revokingItems) {
            allRevoking.set(ri.id,ri);
        }
    }

    let rSum = new BigDecimal("0");

    for (let c of allRevoking.values()) {


        if (!this.isMergeable(c) || !this.validateMergeFields(changed, c) || !this.hasSimilarPermission(c, keys, false)) {
            continue;
        }

        rSum = rSum.add(new BigDecimal(c.state.data[this.fieldName]));
    }

    return rSum.cmp(splitJoinSum) === 0;
};

SplitJoinPermission.prototype.checkSplit = function(changed, dataChanges, revokingItems, keys, oldValue, newValue) {


    // We need to find the splitted contracts
    let sum = new BigDecimal("0");
    let revokesToRemove = new Set();


    for (let s of changed.context.siblings) {

        if (!this.isMergeable(s) || !this.validateMergeFields(changed, s) || !this.hasSimilarPermission(s, keys, false)) {
            continue;
        }
        sum = sum.add(new BigDecimal(s.state.data[this.fieldName]));
    }


    // total value should not be changed or check split-join case
    let isValid = sum.cmp(oldValue) === 0;

    if (!isValid)
        isValid = this.checkSplitJoinCase(changed, revokesToRemove, keys);


    if (isValid && newValue.gte(this.minValue) && newValue.ulp().cmp(this.minUnit) >= 0) {
        delete dataChanges[this.fieldName];
        for(let ri of revokesToRemove) {
            revokingItems.remove(ri);
        }
    }
};

SplitJoinPermission.prototype.checkMerge = function(changed, dataChanges, revokingItems, keys, newValue) {

    // merge means there are mergeable contracts in the revoking items
    let sum = new BigDecimal("0");
    let revokesToRemove = new Set();
    for (let c of changed.revokingItems) {

        if (!this.isMergeable(c) || !this.validateMergeFields(changed, c) || !this.hasSimilarPermission(c, keys,true))
            continue;

        revokesToRemove.add(c);

        sum = sum.add(new BigDecimal(c.state.data[this.fieldName]));

    }

    let isValid = sum.cmp(newValue) === 0;

    if (!isValid) {
        revokesToRemove.clear();
        isValid = this.checkSplitJoinCase(changed, revokesToRemove, keys);
    }

    if (isValid) {
        delete dataChanges[this.fieldName];
        for(let ri of revokesToRemove) {
            revokingItems.remove(ri);
        }
    }
};

SplitJoinPermission.prototype.checkChanges = function(contract, changed, stateChanges, revokingItems, keys) {
    if(!stateChanges.hasOwnProperty("data"))
        return;

    let dataChanges = stateChanges.data.changes;

    if (dataChanges == null)
        return;
    if(!dataChanges.hasOwnProperty(this.fieldName))
        return;

    let delta = dataChanges[this.fieldName];
    if (delta != null) {
        if (!(delta instanceof dlt.ChangedItem))
            return;
        try {
            let oldValue = new BigDecimal(delta.oldValue);
            let newValue = new BigDecimal(delta.newValue);

            let cmp = oldValue.cmp(newValue);
            if (cmp > 0)
                this.checkSplit(changed, dataChanges, revokingItems, keys, oldValue, newValue);
            else if (cmp < 0)
                this.checkMerge(changed, dataChanges, revokingItems, keys, newValue);
        } catch (err) {
            if(t.THROW_EXCEPTIONS)
                throw err;
            console.log("SplitJoinPermission.checkChanges:" + err.message)
        }
    }
};


SplitJoinPermission.prototype.hasSimilarPermission = function(contract, keys, checkAllowance) {
    let permissions = contract.definition.permissions.get("split_join");
    if(permissions == null)
        return false;
    let found = false;
    for(let p of permissions) {

        //TODO: WHY CANT WE CALL this.equals(p)????
        if(!Permission.prototype.equals.call(this,p))
            continue;

        if(checkAllowance && !p.isAllowedForKeys(keys)) {
            continue
        }
        found = true;
        break;
    }
    return found;
};

SplitJoinPermission.prototype.validateMergeFields = function(c1, c2) {

    for (let field of this.mergeFields) {
        let v1 = c1.get(field);
        let v2 = c2.get(field);
        if (!v1.equals(v2))
            return false;
    }
    return true;
};

SplitJoinPermission.prototype.isMergeable = function(c) {
    if(!c.state.data.hasOwnProperty(this.fieldName))
        return false;
    return c.state.data[this.fieldName] != null;
};



dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ChangeNumberPermission",ChangeNumberPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ChangeOwnerPermission",ChangeOwnerPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ModifyDataPermission",ModifyDataPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("RevokePermission",RevokePermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("SplitJoinPermission",SplitJoinPermission));



///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Permission,ChangeNumberPermission,ChangeOwnerPermission,ModifyDataPermission,RevokePermission,SplitJoinPermission};