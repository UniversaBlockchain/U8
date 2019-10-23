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
        let r = this.resolve();
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
     * @returns {Role} first non-link role in chain if found. Otherwise {null}
     */
    resolve() {
        let maxDepth = 40;
        for (let r = this; maxDepth > 0; maxDepth--) {
            if (r instanceof RoleLink) {
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
        let r = this.resolve();
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

        if(param instanceof crypto.KeyAddress) {
            this.keyAddresses.add(param);
        } else if(param instanceof crypto.PublicKey) {
            this.keyRecords.set(param,new KeyRecord(param));
        } else if(param instanceof crypto.PrivateKey) {
            this.keyRecords.set(param.publicKey,new KeyRecord(param.publicKey));
        } else if(param instanceof Array || param instanceof Set || param instanceof t.GenericSet) {
            for(let p of param) {
                if(p instanceof crypto.KeyAddress) {
                    this.keyAddresses.add(p);
                } else if(p instanceof crypto.PublicKey) {
                    this.keyRecords.set(p,new KeyRecord(p));
                } else if(p instanceof crypto.PrivateKey) {
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

class QuorumVoteRole extends Role {

    constructor(name, source, quorum, contract = null) {
        super(name, contract);
        this.source = source;
        this.quorum = quorum;
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

        if (!Object.getPrototypeOf(QuorumVoteRole.prototype).equals.call(this, to))
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
    }

    async serialize(serializer) {
        let data = await Object.getPrototypeOf(QuorumVoteRole.prototype).serialize.call(this, serializer);

        data.source = this.source;
        data.quorum = this.quorum;

        return data;
    }

    /**
     * Check role is allowed to keys
     *
     * @param {Iterable<crypto.PrivateKey> | Iterable<crypto.PublicKey>} keys - Keys to check allowance for
     * @returns {boolean} if role is allowed for a set of keys
     */
    isAllowedForKeys(keys) {
        if (!Object.getPrototypeOf(QuorumVoteRole.prototype).isAllowedForKeys.call(this, keys))
            return false;

        let idx = this.source.indexOf(".");
        let from = this.source.substring(0, idx);
        let what = this.source.substring(idx + 1);
        let fromContract = null;
        if (from === "this")
            fromContract = this.contract;
        else {
            let constr = this.contract.constraints.get(from);
            if (constr == null)
                return false;

            if (constr.matchingItems.size === 0)
                return false;
            else
                fromContract = Array.from(constr.matchingItems)[0];
        }

        let roles = [];
        let o = fromContract.get(what);
        if (o instanceof Role) {
            if (o instanceof RoleLink)
                o = o.resolve();

            if (o instanceof ListRole)
                roles = o.roles;
            else
                return false;

        } else if (o instanceof Array) {
            try {
                o.forEach(item => {
                    if (item instanceof Role)
                        roles.push(item);
                    else if (item instanceof crypto.KeyAddress || item instanceof crypto.PublicKey)
                        roles.push(new SimpleRole("@role" + roles.length, item));
                    else if (typeof item === "string")
                        roles.push(new SimpleRole("@role" + roles.length, new crypto.KeyAddress(item)));
                });
            } catch (err) {
                return false;
            }

        } else
            return false;

        let minValidCount = 0;
        if (this.quorum.endsWith("%")) {
            let percent = new BigDecimal(this.quorum.substring(0, this.quorum.length - 1));
            minValidCount = Math.ceil(Number.parseFloat(percent.mul(roles.length).div(100).toFixed()));
        } else
            minValidCount = Number.parseInt(this.quorum);

        for (let r of roles) {
            if (r.isAllowedForKeys(keys))
                minValidCount--;

            if (minValidCount === 0)
                break;
        }

        return minValidCount === 0;
    }

    /**
     * Get names of {@link Constraint} that are not required but are used in voting.
     */
    getSpecialConstraints() {
        let constrs = new Set();

        let sourceConstraint = this.source.substring(0, this.source.indexOf("."));
        constrs.add(sourceConstraint);

        // add internal constraints
        let idx = this.source.indexOf(".");
        let from = this.source.substring(0, idx);
        if (!from.equals("this")) {
            let constr = this.contract.constraints.get(from);
            if (constr != null)
                constrs.addAll(constr.getInternalConstraints());
        }

        return constrs;
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
            return this.extractKeys(role.resolve());
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
            return this.extractAddresses(role.resolve());
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