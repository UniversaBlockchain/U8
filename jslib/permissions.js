let bs = require("biserializable");
let dbm = require("defaultbimapper");
let t = require("tools");
let dlt = require("deltas");
let err = require("errors");
let roles = require("roles")
let BigDecimal  = require("big").Big;
const ex = require("exceptions");

///////////////////////////
//Permission
///////////////////////////

class Permission extends bs.BiSerializable {
    /**
     * Abstract permission for the Universa contract. The permission implements the right of a {Role} player (e.g. Universa party, set of keys used in signing the contract) to
     * perform some change over the contract state. The real permissions are all superclasses of it.
     */
    constructor(name,role,params) {
        super();
        this.name = name;
        this.role = role;
        this.params = params;
    }

    /**
     * Check if permission-associated role is allowed for set of keys.
     * @param keys {Iterable<crypto.PrivateKey> | Iterable<crypto.PublicKey>} keys to check allowance for
     * @returns {boolean} indicates if permission is allowed for keys
     */
    isAllowedForKeys(keys) {
        return this.role.isAllowedForKeys(keys);
    }

    deserialize(data, deserializer) {
        this.name = data.name;
        this.role = deserializer.deserialize(data.role);
        this.params = data;

        for (let key in data) {
            if(key === "name")
                continue;
            if(key === "role")
                continue;
            this[key] = data[key];
        }

    }

    serialize(serializer) {

        let result = {
            name:this.name,
            role:serializer.serialize(this.role)
        };
        if(this.params != null) {
            for (let key of Object.keys(this.params)) {
                result[key] = this.params[key];
            }
        }
        return result;
    }

    equals(to) {
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
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
        throw new Error("not implemented");
    }

    /**
     * Create new permission of a specific type by type name.
     *
     * @param {string} name - Specific type name.
     * @param {Role} role - Role allows to permission.
     * @param {object} params - Parameters of permission, set of parameters depends on the type of permission.
     *
     * @return {Permission} permission
     */
    static forName(name, role, params) {
        switch (name) {
            case "revoke":
                return new RevokePermission(role);
            case "change_owner":
                return new ChangeOwnerPermission(role);
            case "modify_data":
                return new ModifyDataPermission(role, params);
            case "decrement_permission":
                return new ChangeNumberPermission(role, params);
            default:
                throw new ex.IllegalArgumentError("can't construct permission: " + name);
        }
    }
}


///////////////////////////
//ChangeNumberPermission
///////////////////////////

class ChangeNumberPermission extends Permission {
    /**
     * Permission allows to change some numeric (as for now, integer) field, controlling it's range
     * and delta. This permission could be used more than once allowing for different roles to
     * change in different range and directions.
     * @param role {Role} role need to be played to allow permission
     * @param params {Object} containing fields: min_value, max_value, min_step, max_step
     * @constructor
     */
    constructor(role,params) {
        super("decrement_permission", role, params);
        if(params)
            this.initFromParams();
    }

    initFromParams() {
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
    }

    serialize(serializer) {
        this.params = {
            field_name : this.fieldName,
            max_step : this.maxStep,
            min_step : this.minStep,
            max_value : this.maxValue,
            min_value : this.minValue
        };
        return Object.getPrototypeOf(ChangeNumberPermission.prototype).serialize.call(this,serializer);
    }

    deserialize(data, deserializer) {
        Object.getPrototypeOf(ChangeNumberPermission.prototype).deserialize.call(this,data,deserializer);
        this.initFromParams();
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
        if(!stateChanges.hasOwnProperty("data"))
            return;

        let dataChanges = stateChanges.data;
        if (dataChanges == null)
            return;

        if (dataChanges instanceof dlt.MapDelta && dataChanges.changes.hasOwnProperty(this.fieldName)) {

            let delta = dataChanges.changes[this.fieldName];
            if (delta != null) {
                if (!(delta instanceof dlt.ChangedItem))
                    return;


                //TODO: big decimal?
                let valueDelta = delta.newValue - delta.oldValue;


                if (valueDelta >= this.minStep && valueDelta <= this.maxStep) {

                    if (delta.newValue <= this.maxValue && delta.newValue >= this.minValue)
                        delete dataChanges.changes[this.fieldName];
                }
            }
        }
    }
}


///////////////////////////
//ChangeOwnerPermission
///////////////////////////

class ChangeOwnerPermission extends Permission {
    /**
     * Permission allows to change and remove owner role of contract.
     * @param role {Role} role need to be played to allow permission
     * @constructor
     */
    constructor(role) {
        super("change_owner", role, {});
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
        if(!stateChanges.hasOwnProperty("owner"))
            return;
        delete stateChanges.owner;
    }
}


///////////////////////////
//ModifyDataPermission
///////////////////////////

class ModifyDataPermission extends Permission {
    /**
     * Permission allows to change some set of fields. Field values can be limited to a list of values.
     * @param role {Role} role need to be played to allow permission
     * @param params {Object} with the only property "fields" containing Object:  fieldName -> inteable<Value> (null for whitelist)
     * @constructor
     */
    constructor(role,params) {
        super("modify_data", role, params);
        if(params)
            this.initFromParams();
        this.rootFields = ["references", "expires_at"];
    }

    initFromParams() {
        this.fields = this.params.fields;
    }

    serialize(serializer) {
        let data =  Object.getPrototypeOf(ModifyDataPermission.prototype).serialize.call(this,serializer);
        data.fields = serializer.serialize(this.fields);
        return data;
    }

    deserialize(data, deserializer) {
        Object.getPrototypeOf(ModifyDataPermission.prototype).deserialize.call(this,data,deserializer);
        this.initFromParams();
    }

    acceptsChange(field, value) {
        if(this.fields.hasOwnProperty(field)) {
            if(this.fields[field] == null) {
                return true;
            } else {
                let acceptedValues = this.fields[field];
                for (let v of acceptedValues) {
                    if (t.valuesEqual(v, value)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
        if(!stateChanges.hasOwnProperty("data"))
            return;

        let dataChanges = stateChanges.data;
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
    }
}


///////////////////////////
//RevokePermission
///////////////////////////

class RevokePermission extends Permission {
    /**
     * Permission allows to revoke contract.
     * @param role {Role} role need to be played to allow permission
     * @constructor
     */
    constructor(role) {
        super("revoke", role, {});
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
        // this permission checks no changes, it's about the whole contract
    }
}


///////////////////////////
//SplitJoinPermission
///////////////////////////

class SplitJoinPermission extends Permission {
    /**
     * Permission to split and join contracts with the split and join of the value of a certain numeric field of contracts.
     *
     * For contracts with a certain number field ("amount") the following is allowed:
     *
     * - several multiple revisions can be legitimately derived (“split”) from any revision only if their total "amount"
     * is the same as the "amount" of the base revision;
     *
     * - several multiple revisions can be legitimately “joined”  if the result "amount' is the same as the sum of "amounts"
     * in the base revisions.
     *
     * @param role {Role} role need to be played to allow permission
     * @param params {Object} containing fields: <p>
     * field_name (field name in {State} data containing value being split/joined), <p>
     * min_value (bigdecimal represents minimal value), <p>
     * min_unit (bigdecimal represents minimal unit), <p>
     * join_match_fields (array of comma-separated pathes to fields that should match for joinable contracts)
     *
     * @constructor
     */
    constructor(role,params) {
        super("split_join", role, params);
        if(params)
            this.initFromParams();
    }

    initFromParams() {
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
    }

    serialize(serializer) {
        this.params = {
            field_name : this.fieldName,
            min_unit : this.minUnit,
            min_value : this.minValue,
            join_match_fields : this.mergeFields
        };
        return Object.getPrototypeOf(ChangeNumberPermission.prototype).serialize.call(this,serializer);
    }

    deserialize(data, deserializer) {
        Object.getPrototypeOf(ChangeNumberPermission.prototype).deserialize.call(this,data,deserializer);
        this.initFromParams();
    }

    checkSplitJoinCase(changed, revokesToRemove, keys) {
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


            if (!this.isMergeable(c) || !this.validateMergeFields(changed, c) || !this.hasSimilarPermission(c, keys, true)) {
                continue;
            }
            revokesToRemove.add(c);

            rSum = rSum.add(new BigDecimal(c.state.data[this.fieldName]));
        }
        return rSum.cmp(splitJoinSum) === 0;
    }

    checkSplit(changed, dataChanges, revokingItems, keys, oldValue, newValue) {


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
                revokingItems.delete(ri);
            }
        }
    }

    checkMerge(changed, dataChanges, revokingItems, keys, newValue) {

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
                revokingItems.delete(ri);
            }

        }
    }

    checkChanges(contract, changed, stateChanges, revokingItems, keys) {
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
    }

    hasSimilarPermission(contract, keys, checkAllowance) {
        let permissions = contract.definition.permissions.get("split_join");
        if(permissions == null)
            return false;
        let found = false;
        for(let p of permissions) {

            if(!t.valuesEqual(this.params,p.params))
                continue;

            if(checkAllowance && !p.isAllowedForKeys(keys)) {
                continue
            }
            found = true;
            break;
        }
        return found;
    }

    validateMergeFields(c1, c2) {

        for (let field of this.mergeFields) {
            let v1 = c1.get(field);
            let v2 = c2.get(field);
            if (!t.valuesEqual(v1,v2))
                return false;
        }
        return true;
    }

    isMergeable(c) {
        if(!c.state.data.hasOwnProperty(this.fieldName))
            return false;
        return c.state.data[this.fieldName] != null;
    }
}


dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ChangeNumberPermission",ChangeNumberPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ChangeOwnerPermission",ChangeOwnerPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ModifyDataPermission",ModifyDataPermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("RevokePermission",RevokePermission));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("SplitJoinPermission",SplitJoinPermission));



///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Permission,ChangeNumberPermission,ChangeOwnerPermission,ModifyDataPermission,RevokePermission,SplitJoinPermission};