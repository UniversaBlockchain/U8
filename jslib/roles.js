/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

/**
 * @module roles
 */

const bs = require("biserializable");
const dbm = require("defaultbimapper");
const t = require("tools");
const KeyRecord = require("keyrecord").KeyRecord;
const ex = require("exceptions");
const BigDecimal  = require("big").Big;

///////////////////////////
//Role
///////////////////////////

const RequiredMode = {
    ALL_OF : "ALL_OF",
    ANY_OF : "ANY_OF"
};


class Role extends bs.BiSerializable {
    /**
     * Base class for every role. Defines role name and constraints
     * @param {string} name - Name of the role
     * @param {Contract} contract - Contract with role
     * @constructor
     */
    constructor(name, contract = null) {
        super();
        this.name = name;
        this.contract = contract;
        this.comment = null;
        this.requiredAllConstraints = new Set();
        this.requiredAnyConstraints = new Set();
    }

    /**
     * Check if role is valid
     * @returns {boolean} indicating if role is valid
     */
    isValid() {
        return false;
    }

    equals(to) {
        if(this === to)
            return true;


        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.name,to.name))
            return false;

        if(!t.valuesEqual(this.comment,to.comment))
            return false;

        if(!t.valuesEqual(this.requiredAllConstraints,to.requiredAllConstraints))
            return false;

        if(!t.valuesEqual(this.requiredAnyConstraints,to.requiredAnyConstraints))
            return false;

        return true;
    }

    equalsForConstraint(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.comment,to.comment))
            return false;

        if(!t.valuesEqual(this.requiredAllConstraints,to.requiredAllConstraints))
            return false;

        if(!t.valuesEqual(this.requiredAnyConstraints,to.requiredAnyConstraints))
            return false;

        return true;
    }

    containConstraint(name) {
        return (this.requiredAllConstraints.has(name) || this.requiredAnyConstraints.has(name) || this.getSpecialConstraints().has(name));
    }

    /**
     * Check if role allowed for a set of keys.
     * Note that role constraints are also checked (in context of contract role is attached to)
     * @param {Iterable<crypto.PrivateKey> | Iterable<crypto.PublicKey>} keys - Keys to check allowance for
     * @returns {boolean} if role is allowed for a set of keys
     */
    isAllowedForKeys(keys) {
        return this.isAllowedForConstraints(this.contract == null ? new Set() : this.contract.validRoleConstraints)
    }

    isAllowedForKeysQuantized(keys) {
        // TODO: add quantisation
        return this.isAllowedForKeys(keys);
    }

    isAllowedForConstraints(constraints) {

        for(let constr of this.requiredAllConstraints) {
            if (!constraints.has(constr)) {
                return false;
            }
        }

        if(this.requiredAnyConstraints.size === 0)
            return true;

        for(let constr of this.requiredAnyConstraints) {
            if (constraints.has(constr)) {
                return true;
            }
        }

        return false;
    }

    async deserialize(data, deserializer) {
        this.name = data.name;

        if(data.hasOwnProperty("comment"))
            this.comment = data.comment;
        else
            this.comment = null;

        if(data.hasOwnProperty("required")) {
            let required = data.required;
            if(required != null) {
                if(required.hasOwnProperty(RequiredMode.ALL_OF)) {
                    let array = await deserializer.deserialize(required[RequiredMode.ALL_OF]);
                    array.forEach(item => this.requiredAllConstraints.add(item))
                }

                if(required.hasOwnProperty(RequiredMode.ANY_OF)) {
                    let array = await deserializer.deserialize(required[RequiredMode.ANY_OF]);
                    array.forEach(item => this.requiredAnyConstraints.add(item))
                }
            }
        }
    }

    async serialize(serializer) {
        let res = {name:this.name};
        if(this.requiredAnyConstraints.size + this.requiredAllConstraints.size > 0) {
            let required = {};
            if (this.requiredAnyConstraints.size > 0)
                required[RequiredMode.ANY_OF] = await serializer.serialize(this.requiredAnyConstraints);

            if (this.requiredAllConstraints.size > 0)
                required[RequiredMode.ALL_OF] = await serializer.serialize(this.requiredAllConstraints);

            res.required = required;
        }
        return res;
    }

    /**
     * Creates {RoleLink} that points to current role
     * @param linkName {string} name of the {RoleLink}
     * @returns {RoleLink} created link
     */
    linkAs(linkName) {
        let newRole = new RoleLink(linkName, name);
        if (this.contract != null)
            this.contract.registerRole(newRole);
        return newRole;
    }

    toString() {
        return crypto.HashId.of(t.randomBytes(64)).base64;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }

    static fromDsl(name, serializedRole) {
        if (name == null)
            name = serializedRole.name;
        let result;

        let type;
        if (serializedRole.hasOwnProperty("type"))
            type = serializedRole.type;

        if (type == null || type.toLowerCase() === "simple")
            result = new SimpleRole(name);
        else if (type.toLowerCase() === "link")
            result = new RoleLink(name);
        else if (type.toLowerCase() === "list")
            result = new ListRole(name);
        else if (type.toLowerCase() === "quorum_vote")
            result = new QuorumVoteRole(name);
        else
            throw new ex.IllegalArgumentError("Unknown role type: " + type);

        result.initWithDsl(serializedRole);

        if (serializedRole.hasOwnProperty("requires")) {
            if(serializedRole.requires.hasOwnProperty("all_of"))
                serializedRole.requires.all_of.forEach(item => result.requiredAllConstraints.add(item));

            if(serializedRole.requires.hasOwnProperty("any_of"))
                serializedRole.requires.any_of.forEach(item => result.requiredAnyConstraints.add(item));
        }

        if (serializedRole.hasOwnProperty("comment"))
            result.comment = serializedRole.comment;

        return result;
    }

    /**
     * Get names of {@link Constraint} that are not required but are used in voting.
     */
    getSpecialConstraints() {
        return new Set();
    }
}


///////////////////////////
//RoleLink
///////////////////////////

class RoleLink extends Role {
    /**
     * A symlink-like role delegate. It uses a named role in the context of a bound {@link Contract},
     * it delegates all actual work to the target role from the contract roles.
     * <p>
     * This is used to assign roles to roles, and to create special roles for permissions, etc.
     *
     * @param {string} name - Name of the link
     * @param {string} roleName - Name of the linked role
     * @param {Contract} contract - Contract with role
     * @constructor
     */
    constructor(name, roleName, contract = null) {
        super(name, contract);
        this.roleName = roleName;
    }

    isValid() {
        let r = this.resolve(true);
        if(r != null)
            return r.isValid();
        else
            return false;
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(RoleLink.prototype).equals.call(this,to))
            return false;

        if(!t.valuesEqual(this.roleName,to.roleName))
            return false;

        return true;
    }

    equalsForConstraint(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(RoleLink.prototype).equalsForConstraint.call(this,to))
            return false;

        if(!t.valuesEqual(this.roleName,to.roleName))
            return false;

        return true;
    }

    containConstraint(name) {
        if (Object.getPrototypeOf(RoleLink.prototype).containConstraint.call(this, name))
            return true;

        if (this.contract == null || (!this.contract.roles.hasOwnProperty(this.roleName) &&
            !this.contract.state.roles.hasOwnProperty(this.roleName)))
            return false;

        return (this.contract.roles.hasOwnProperty(this.roleName) && this.contract.roles[this.roleName].containConstraint(name)) ||
               (this.contract.state.roles.hasOwnProperty(this.roleName) && this.contract.state.roles[this.roleName].containConstraint(name));
    }

    async deserialize(data, deserializer) {
        await Object.getPrototypeOf(RoleLink.prototype).deserialize.call(this,data,deserializer);
        this.roleName = data.target_name;
    }

    async serialize(serializer) {
        let data = await Object.getPrototypeOf(RoleLink.prototype).serialize.call(this,serializer);
        data.target_name = this.roleName;
        return data;
    }

    /**
     * Get role it is linked to
     * @returns {Role} linked role
     */
    getRole() {
        let role = this.contract.roles[this.roleName];
        if (role == null)
            role = this.contract.state.roles[this.roleName];
        return role;
    }

    /**
     * Follows the links until real (not link) role is found. It is then returned.
     * @param {boolean} ignoreConstrs - Ignore constraints for resolving process. True by default.
     * @returns {Role} first non-link role in chain if found. Otherwise {null}
     */
    resolve(ignoreConstrs = true) {
        let maxDepth = 40;
        for (let r = this; maxDepth > 0; maxDepth--) {
            if (r instanceof RoleLink && (ignoreConstrs || (
                r.requiredAllConstraints.size === 0 &&
                r.requiredAnyConstraints.size === 0))) {

                r = r.getRole();
                if (r == null)
                    return null;
            } else {
                return r;
            }
        }
        return null;
    }

    isAllowedForKeys(keys) {
        if(!Object.getPrototypeOf(RoleLink.prototype).isAllowedForKeys.call(this,keys))
            return false;
        let r = this.resolve(false);
        if(r != null)
            return r.isAllowedForKeys(keys);
        else
            return false;
    }

    initWithDsl(serializedRole) {
        if (serializedRole.hasOwnProperty("target"))
            this.roleName = serializedRole.target;
        else
            throw new ex.IllegalArgumentError("Unknown target of RoleLink");

        if (this.name === this.roleName)
            throw new ex.IllegalArgumentError("RoleLink: name and target name are equals: " + this.roleName);

    }
}


///////////////////////////
//ListRole
///////////////////////////

const ListRoleMode = {
    ALL : "ALL",
    ANY : "ANY",
    QUORUM : "QUORUM"
};


class ListRole extends Role {
    /**
     * Role combining other roles (sub-roles) in the "and", "or" and "any N of" principle.
     *
     * @param {string} name - Name of the role
     * @param {Array<Role>} roles - Array of sub-roles. Empty by default
     * @param {ListRoleMode} mode - Mode of checking sub-roles. "ALL" ("and") by default
     * @param {number} quorumSize - N from "any N of" principle of quorum ListRole. 0 by default
     * @param {Contract} contract - Contract with role
     * @constructor
     */
    constructor(name, roles = [], mode = ListRoleMode.ALL, quorumSize = 0, contract = null) {
        super(name, contract);
        this.mode = mode;
        this.roles = roles;
        this.quorumSize = quorumSize;
    }

    isValid() {
        return this.roles.length > 0 && (this.mode !== ListRoleMode.QUORUM || this.quorumSize <= this.roles.length);
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(ListRole.prototype).equals.call(this,to))
            return false;

        if(!t.valuesEqual(this.mode,to.mode))
            return false;

        if(this.mode === ListRoleMode.QUORUM) {
            if(!t.valuesEqual(this.quorumSize,to.quorumSize))
                return false;
        }

        if(!t.valuesEqual(new t.GenericSet(this.roles), new t.GenericSet(to.roles)))
            return false;

        return true;
    }

    equalsForConstraint(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(ListRole.prototype).equalsForConstraint.call(this,to))
            return false;

        if(!t.valuesEqual(this.mode,to.mode))
            return false;

        if(this.mode === ListRoleMode.QUORUM) {
            if(!t.valuesEqual(this.quorumSize,to.quorumSize))
                return false;
        }

        if(!t.valuesEqual(new t.GenericSet(this.roles), new t.GenericSet(to.roles)))
            return false;

        return true;
    }

    containConstraint(name) {
        if (Object.getPrototypeOf(RoleLink.prototype).containConstraint.call(this, name))
            return true;

        if (this.contract == null)
            return false;

        let contain = false;
        for (let role of this.roles)
            if (role.containConstraint(name)) {
                contain = true;
                break;
            }

        return contain;
    }

    async deserialize(data, deserializer) {
        await Object.getPrototypeOf(ListRole.prototype).deserialize.call(this,data,deserializer);

        this.quorumSize = data.quorumSize;

        let mode = data.mode;
        if (mode != null) {
            for(let key in ListRoleMode) {
                if(ListRoleMode[key] === mode) {
                    this.mode = key;
                }
            }
        }

        let roles = data.roles;
        for(let r of roles) {
            this.roles.push(await deserializer.deserialize(r));
        }
    }

    async serialize(serializer) {
        let data = await Object.getPrototypeOf(ListRole.prototype).serialize.call(this,serializer);
        data.quorumSize = this.quorumSize;
        data.mode = ListRoleMode[this.mode];
        data.roles = await serializer.serialize(this.roles);
        return data;
    }

    isAllowedForKeys(keys) {
        if(!Object.getPrototypeOf(ListRole.prototype).isAllowedForKeys.call(this,keys))
            return false;

        let valid = 0;
        let required;
        if(this.mode === ListRoleMode.ALL)
            required = this.roles.length;
        else if(this.mode === ListRoleMode.ANY)
            required = 1;
        else if(this.mode === ListRoleMode.QUORUM)
            required = this.quorumSize;

        if (!keys instanceof t.GenericSet)
            keys = new t.GenericSet(keys);
        for(let r of this.roles) {
            if(r.isAllowedForKeys(keys)) {
                valid++;
                if (valid >= required)
                    return true;
            }
        }

        return valid >= required;
    }

    initWithDsl(serializedRole) {
        if (!serializedRole.hasOwnProperty("roles"))
            throw new ex.IllegalArgumentError("Unknown roles of ListRole");

        if (!serializedRole.hasOwnProperty("mode"))
            throw new ex.IllegalArgumentError("Unknown mode of ListRole");

        let roleObjects = serializedRole.roles;
        this.mode = serializedRole.mode.toUpperCase();

        if(this.mode === ListRoleMode.QUORUM)
            this.quorumSize = serializedRole.quorumSize;

        roleObjects.forEach(x => {
            if (typeof x === "string")
                this.roles.push(new RoleLink(x + "link" + Date.now(), x));
            else
                this.roles.push(Role.fromDsl(null, x));
        });
    }
}


///////////////////////////
//SimpleRole
///////////////////////////

class SimpleRole extends Role {
    /**
     * Base class for any role combination, e.g. single key, any key from a set, all keys from a set, minimum number of key
     * from a set and so on.
     * IMPORTANT, This class express "all_of" logic, e.g. if all of the presented keys are listed, then the role is allowed.

     * @param name {string} name of the role
     * @param param {crypto.PublicKey|crypto.PrivateKey|crypto.KeyAddress|Iterable<crypto.PublicKey>|Iterable<crypto.PrivateKey>|Iterable<crypto.KeyAddress>}
     * @param {Contract} contract - Contract with role
     *
     * @constructor
     */
    constructor(name, param, contract = null) {
        super(name, contract);
        this.keyAddresses = new t.GenericSet();
        this.keyRecords = new t.GenericMap();

        if (param == null)
            return;

        if (param instanceof crypto.KeyAddress) {
            this.keyAddresses.add(param);
        } else if (param instanceof crypto.PublicKey) {
            this.keyRecords.set(param,new KeyRecord(param));
        } else if (param instanceof crypto.PrivateKey) {
            this.keyRecords.set(param.publicKey,new KeyRecord(param.publicKey));
        } else if (param instanceof Array || param instanceof Set || param instanceof t.GenericSet) {
            for (let p of param) {
                if (p instanceof crypto.KeyAddress) {
                    this.keyAddresses.add(p);
                } else if (p instanceof crypto.PublicKey) {
                    this.keyRecords.set(p,new KeyRecord(p));
                } else if (p instanceof crypto.PrivateKey) {
                    this.keyRecords.set(p.publicKey,new KeyRecord(p.publicKey));
                } else {
                    throw new ex.IllegalArgumentError("invalid param type")
                }
            }
        }
    }

    isValid() {
        return this.keyRecords.size > 0 || this.keyAddresses.size > 0 ||
            this.requiredAllConstraints.size > 0 || this.requiredAnyConstraints.size > 0;
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(SimpleRole.prototype).equals.call(this,to))
            return false;

        if(!t.valuesEqual(this.keyRecords,to.keyRecords))
            return false;

        if(!t.valuesEqual(this.keyAddresses,to.keyAddresses))
            return false;

        return true;
    }

    equalsForConstraint(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!Object.getPrototypeOf(SimpleRole.prototype).equalsForConstraint.call(this,to))
            return false;

        if(!this.hasAllKeys(to))
            return false;

        if(!to.hasAllKeys(this))
            return false;

        return true;
    }

    hasAllKeys(to) {
        for (let key of this.keyRecords.keys())
            if (!(to.keyRecords.get(key) || to.keyAddresses.has(key.shortAddress) || to.keyAddresses.has(key.longAddress)))
                return false;

        for (let addr of this.keyAddresses) {
            if (to.keyAddresses.has(addr))
                continue;

            let foundKey = false;
            for (let key of to.keyRecords.keys())
                if (addr.equals(key.shortAddress) || addr.equals(key.longAddress))
                    foundKey = true;

            if (!foundKey)
                return false;
        }

        return true;
    }

    async deserialize(data, deserializer) {
        await Object.getPrototypeOf(SimpleRole.prototype).deserialize.call(this,data,deserializer);

        for(let key of await deserializer.deserialize(data.keys)) {
            this.keyRecords.set(key.key,new KeyRecord(key.key));
        }

        for(let address of await deserializer.deserialize(data.addresses)) {
            this.keyAddresses.add(address);
        }

    }

    async serialize(serializer) {
        let data = await Object.getPrototypeOf(SimpleRole.prototype).serialize.call(this,serializer);

        let array = [];
        for (let v of this.keyRecords.values())
            array.push(v);

        data.keys = await serializer.serialize(array);
        data.addresses = await serializer.serialize(this.keyAddresses);

        return data;
    }

    isAllowedForKeys(keys) {
        if (!Object.getPrototypeOf(SimpleRole.prototype).isAllowedForKeys.call(this,keys))
            return false;


        for (let key of this.keyRecords.keys()) {
            let found = false;
            for (let k of keys) {
                if (k instanceof crypto.PublicKey && t.valuesEqual(k, key) ||
                    k instanceof crypto.PrivateKey && t.valuesEqual(k.publicKey, key)) {
                    found = true;
                    break;
                }
            }
            if (!found)
                return false;
        }


        for (let address of this.keyAddresses) {
            let found = false;
            for (let k of keys) {
                if (k instanceof crypto.PublicKey && address.match(k) ||
                    k instanceof crypto.PrivateKey && address.match(k.publicKey)) {
                    found = true;
                    break;
                }
            }
            if (!found)
                return false;
        }

        return true;
    }

    addKeyRecord(keyRecord) {
        this.keyRecords.set(keyRecord.key, keyRecord);
    }

    initWithDsl(serializedRole) {
        if (serializedRole.hasOwnProperty("keys")) {
            let list = serializedRole.keys;
            for (let k of list)
                this.addKeyRecord(KeyRecord.fromDsl(k));
        } else if (serializedRole.hasOwnProperty("key"))
            this.addKeyRecord(KeyRecord.fromDsl(serializedRole));

        if (serializedRole.hasOwnProperty("addresses")) {
            let list = serializedRole.addresses;
            for (let a of list)
                this.keyAddresses.add(new crypto.KeyAddress(a.uaddress));
        } else if (serializedRole.hasOwnProperty("uaddress"))
            this.keyAddresses.add(new crypto.KeyAddress(serializedRole.uaddress));
    }
}

///////////////////////////
//QuorumVoteRole
///////////////////////////

const QuorumOperators = {
    OPERATOR_ADD : "OPERATOR_ADD",
    OPERATOR_SUBTRACT : "OPERATOR_SUBTRACT"
};

let operatorSymbols = {
    "+" : QuorumOperators.OPERATOR_ADD,
    "-" : QuorumOperators.OPERATOR_SUBTRACT
};

class QuorumVoteRole extends Role {

    constructor (name, source, quorum, contract = null) {
        super(name, contract);
        this.source = source;
        this.quorum = quorum;
        this.quorumValues = [];
        this.quorumOperators = [];
        this.votesCount = null;

        if (this.isValid())
            this.extractValuesAndOperators();
    }

    extractValuesAndOperators() {
        let pos = 0;

        for (let i = 0; i < this.quorum.length; i++) {
            if (operatorSymbols.hasOwnProperty(this.quorum.charAt(i))) {
                let value = this.quorum.substring(pos, i);
                if (value.length === 0)
                    throw new ex.IllegalArgumentError("Invalid quorum format");

                this.quorumValues.push(value);
                this.quorumOperators.push(operatorSymbols[this.quorum.charAt(i)]);
                pos = i + 1;
            }
        }

        let value = this.quorum.substring(pos);
        if (value.length === 0)
            throw new ex.IllegalArgumentError("Invalid quorum format");

        this.quorumValues.push(value);
    }

    isValid() {
        //TODO: additional check (parse quorum and source)
        return this.source != null && this.quorum != null;
    }

    equals(to) {
        if (this === to)
            return true;

        if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if (!Object.getPrototypeOf(QuorumVoteRole.prototype).equals.call(this, to))
            return false;

        if (!t.valuesEqual(this.source, to.source))
            return false;

        return t.valuesEqual(this.quorum, to.quorum);
    }

    equalsForConstraint(to) {
        if (this === to)
            return true;

        if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if (!Object.getPrototypeOf(QuorumVoteRole.prototype).equalsForConstraint.call(this, to))
            return false;

        if (!t.valuesEqual(this.source, to.source))
            return false;

        return t.valuesEqual(this.quorum, to.quorum);
    }

    initWithDsl(serializedRole) {
        this.source = serializedRole.source;
        this.quorum = serializedRole.quorum;
    }

    async deserialize(data, deserializer) {
        await Object.getPrototypeOf(QuorumVoteRole.prototype).deserialize.call(this, data, deserializer);

        this.source = data.source;
        this.quorum = data.quorum;

        if (this.isValid())
            this.extractValuesAndOperators();
    }

    async serialize(serializer) {
        let data = await Object.getPrototypeOf(QuorumVoteRole.prototype).serialize.call(this, serializer);

        data.source = this.source;
        data.quorum = this.quorum;

        return data;
    }


    /**
     * Check role is allowed to keys.
     *
     * @param {Iterable<crypto.PrivateKey> | Iterable<crypto.PublicKey>} keys - Keys to check allowance for.
     * @return {boolean} if role is allowed for a set of keys
     */
    isAllowedForKeys(keys) {
        if (!Object.getPrototypeOf(QuorumVoteRole.prototype).isAllowedForKeys.call(this, keys))
            return false;

        let votingAddresses;

        try {
            votingAddresses = this.getVotingAddresses();
        } catch (e) {
            return false;
        }

        let minValidCount = this.calculateMinValidCount(votingAddresses.length);

        if (this.votesCount != null) {
            return minValidCount <= this.votesCount;

        } else {
            for (let va of votingAddresses) {
                if (Array.from(keys).some(k => va.match(k)))
                    minValidCount--;

                if (minValidCount === 0)
                    break;
            }

            return minValidCount === 0;
        }
    }

    calculateMinValidCount(totalVotesCount) {
        let value = 0;

        for (let i = 0; i < this.quorumValues.length; i++) {
            let curValue;
            let valueString = this.quorumValues[i];
            if (valueString ==="N")
                curValue = totalVotesCount;
            else {
                let isPercentageBased = valueString.endsWith("%");
                if (isPercentageBased) {
                    if (totalVotesCount === 0)
                        throw new ex.IllegalArgumentError("Percentage based quorum requires vote list to be provided at registration");

                    valueString = valueString.substring(0, valueString.length - 1);
                }

                try {
                    curValue = isPercentageBased ? Math.floor(totalVotesCount * parseFloat(valueString) / 100) : parseInt(valueString);
                } catch (ignored) {
                    let idx = valueString.indexOf(".");
                    let from;
                    let what;

                    if (idx === -1) {
                        from = "this";
                        what = "state.data." + valueString;
                    } else {
                        from = valueString.substring(0, idx);
                        what = valueString.substring(idx + 1);
                    }

                    if (from === "this")
                        valueString = this.contract.get(what).toString();
                    else {
                        let constr = this.contract.constraints.get(from);
                        if (constr == null)
                            throw new ex.IllegalArgumentError("Constraint with name '" + from + "' wasn't found for role " + this.name);

                        if (constr.matchingItems.size !== 1)
                            throw new ex.IllegalArgumentError("Constraint with name '" + from + "' should be matching exactly one contract within transaction to be used in QuorumVoteRole");

                        valueString = constr.matchingItems.values().next().value.get(what).toString();
                    }

                    try {
                        curValue = isPercentageBased ? Math.floor(totalVotesCount * parseFloat(valueString) / 100) : parseInt(valueString);
                    } catch (e) {
                        throw new ex.IllegalArgumentError(e);
                    }
                }
            }

            if (i === 0)
                value = curValue;
            else {
                switch (this.quorumOperators.get(i - 1)) {
                    case QuorumOperators.OPERATOR_SUBTRACT:
                        value -= curValue;
                        break;
                    case QuorumOperators.OPERATOR_ADD:
                        value += curValue;
                        break;
                }
            }
        }

        return value;
    }

    getVotesForKeys(keys) {
        let votingAddresses = null;
        try {
            votingAddresses = this.getVotingAddresses();
        } catch (e) {
            console.error(e.stack);
            //TODO: not gonna happen
        }

        let result = [];
        for(let va of votingAddresses)
            if (Array.from(keys).some(k => va.match(k)))
                result.push(va);

        return result;
    }

    getVotingAddresses() {
        let idx = this.source.indexOf(".");
        let from = this.source.substring(0, idx);
        let what = this.source.substring(idx + 1);

        let fromContracts = [];

        if (from === "this")
            fromContracts.push = this.contract;
        else {
            let constr = this.contract.constraints.get(from);
            if (constr == null)
                throw new ex.IllegalArgumentError("Constraint with name '" + from + "' wasn't found for role " + this.name);

            // TODO: this.contract.checkConstraints only for [constr.name]
            constr.matchingItems.forEach(a => fromContracts.push(a));
        }

        let addresses = [];

        for (let fromContract of fromContracts) {
            let o = fromContract.get(what);
            if (o instanceof Role) {
                if (o instanceof RoleLink)
                    o = o.resolve(false);

                if (!(o instanceof ListRole))
                    throw new ex.IllegalArgumentError("Path '" + what + "' is pointing to a role '" + o.name + "' that is not ListRole");
                else
                    for (let r of o.roles) {
                        // TODO: let ka = r.getSimpleAddress();
                        let ka = null;
                        if (ka == null)
                            throw new ex.IllegalArgumentError("Unable to extract simple address from " + r.name + ". Check if role is a simple role with single address and no constraints");
                        this.checkAddress(ka);
                        addresses.push(ka);
                    }
            } else if (o instanceof Array) {
                for (let item of o) {
                    if (item instanceof Role) {
                        // TODO: let ka = item.getSimpleAddress();
                        let ka = null;
                        if (ka == null)
                            throw new ex.IllegalArgumentError("Unable to extract simple address from " + item.name + ". Check if role is a simple role with single address and no constraints");
                        this.checkAddress(ka);
                        addresses.push(ka);

                    } else if (item instanceof crypto.KeyAddress) {
                        this.checkAddress(item);
                        addresses.push(item);

                    } else if (item instanceof crypto.PublicKey) {
                        throw new ex.IllegalArgumentError("Public keys are not allowed in QourumVoteRole source");

                    } else if (item instanceof String) {
                        try {
                            let ka = new crypto.KeyAddress(item);
                            this.checkAddress(ka);
                            addresses.push(ka);
                        } catch (e) {
                            throw new ex.IllegalArgumentError("Unable to parse '" + item + "' into an address");
                        }
                    }
                }
            } else
                throw new ex.IllegalArgumentError("Path '" + what + "' is pointing to neither Role nor Array");
        }

        return addresses;
    }

    checkAddress(ka) {
        // if (!ka.isLong() || ka.getTypeMark() !== 0) //TODO: KeyAddress must support isLong and getTypeMark
        //     throw new ex.IllegalArgumentError("Only the long addresses with type mark 0 are supported by QuorumVoteRole as a source");
    }

    /**
     * Get names of {@link Constraint} that are not required but are used in voting.
     */
    getSpecialConstraints() {
        let constrs = new Set();

        let sourceConstraint = this.source.substring(0, this.source.indexOf("."));

        if (sourceConstraint !== "this") {
            constrs.add(sourceConstraint);
            // add internal constraints
            let constr = this.contract.constraints.get(sourceConstraint);

            if (constr != null)
                constr.getInternalConstraints().forEach(c => constrs.add(c));
        }

        return constrs;
    }

    isQuorumPercentageBased() {
        return this.quorumValues.some(v => v.endsWith("%") || v === "N");
    }
}

dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("RoleLink", RoleLink));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ListRole", ListRole));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("SimpleRole", SimpleRole));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("QuorumVoteRole", QuorumVoteRole));


const RoleExtractor = {
    extractKeys : function (role) {
        if(role instanceof SimpleRole) {
            return new t.GenericSet(role.keyRecords.keys());
        } else if(role instanceof RoleLink) {
            return this.extractKeys(role.resolve(true));
        } else if(role instanceof ListRole) {
            let result = new t.GenericSet();
            role.roles.forEach(r => {
                let extracted = this.extractKeys(r);
                extracted.forEach(e => result.add(e));
            });
            return result;
        } else
            return new t.GenericSet();
    },

    extractAddresses : function (role) {
        if(role instanceof SimpleRole) {
            return role.keyAddresses;
        } else if(role instanceof RoleLink) {
            return this.extractAddresses(role.resolve(true));
        } else if(role instanceof ListRole) {
            let result = new t.GenericSet();
            role.roles.forEach(r => {
                let extracted = this.extractAddresses(r);
                extracted.forEach(e => result.add(e));
            });
            return result;
        } else
            return new t.GenericSet();
    }
};

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {RequiredMode,Role,RoleLink,ListRoleMode,ListRole,SimpleRole,QuorumVoteRole,RoleExtractor};