const bs = require("biserializable");
const dbm = require("defaultbimapper");
const t = require("tools");
const KeyRecord = require("keyrecord").KeyRecord;
const ex = require("exceptions");

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
     * @param name {string} name of the role
     * @constructor
     */
    constructor(name) {
        super();
        this.name = name;
        this.comment = null;
        this.requiredAllConstraints = new Set();
        this.requiredAnyConstraints = new Set();

        this.contract = null;
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
        return (this.requiredAllConstraints.has(name) || this.requiredAnyConstraints.has(name));
    }

    /**
     * Check if role allowed for a set of keys.
     * Note that role constraints are also checked (in context of contract role is attached to)
     * @param keys {iterable<crypto.PrivateKey>} keys to check allowance for
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

    deserialize(data, deserializer) {
        this.name = data.name;

        if(data.hasOwnProperty("comment"))
            this.comment = data.comment;
        else
            this.comment = null;

        if(data.hasOwnProperty("required")) {
            let required = data.required;
            if(required != null) {
                if(required.hasOwnProperty(RequiredMode.ALL_OF)) {
                    let array = deserializer.deserialize(required[RequiredMode.ALL_OF]);
                    array.forEach(item => this.requiredAllConstraints.add(item))
                }

                if(required.hasOwnProperty(RequiredMode.ANY_OF)) {
                    let array = deserializer.deserialize(required[RequiredMode.ANY_OF]);
                    array.forEach(item => this.requiredAnyConstraints.add(item))
                }
            }
        }
    }

    serialize(serializer) {
        let res = {name:this.name};
        if(this.requiredAnyConstraints.size + this.requiredAllConstraints.size > 0) {
            let required = {};
            if(this.requiredAnyConstraints.size > 0) {
                required[RequiredMode.ANY_OF] = serializer.serialize(this.requiredAnyConstraints);
            }

            if(this.requiredAllConstraints.size > 0) {
                required[RequiredMode.ALL_OF] = serializer.serialize(this.requiredAllConstraints);
            }
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
     * @param name name of the link
     * @param roleName name of the linked role
     * @constructor
     */
    constructor(name,roleName) {
        super(name);
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

        if (this.contract == null || this.contract.roles.hasOwnProperty(this.roleName))
            return false;

        return this.contract.roles[this.roleName].containConstraint(name);
    }

    deserialize(data, deserializer) {
        Object.getPrototypeOf(RoleLink.prototype).deserialize.call(this,data,deserializer);
        this.roleName = data.target_name;
    }

    serialize(serializer) {
        let data = Object.getPrototypeOf(RoleLink.prototype).serialize.call(this,serializer);
        data.target_name = this.roleName;
        return data;
    }

    /**
     * Get role it is linked to
     * @returns {Role} linked role
     */
    getRole() {
        return this.contract.roles[this.roleName];
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
     * @param {string} name - Name of the role.
     * @param {Array<Role>} roles - Array of sub-roles. Empty by default.
     * @param {ListRoleMode} mode - Mode of checking sub-roles. "ALL" ("and") by default.
     * @param {number} quorumSize - N from "any N of" principle of quorum ListRole. 0 by default.
     * @constructor
     */
    constructor(name, roles = [], mode = ListRoleMode.ALL, quorumSize = 0) {
        super(name);
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

        if(!t.valuesEqual(new Set(this.roles),new Set(to.roles)))
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

        if(!t.valuesEqual(new Set(this.roles),new Set(to.roles)))
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

    deserialize(data, deserializer) {
        Object.getPrototypeOf(ListRole.prototype).deserialize.call(this,data,deserializer);

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
            this.roles.push(deserializer.deserialize(r));
        }
    }

    serialize(serializer) {
        let data = Object.getPrototypeOf(ListRole.prototype).serialize.call(this,serializer);
        data.quorumSize = this.quorumSize;
        data.mode = ListRoleMode[this.mode];
        data.roles = serializer.serialize(this.roles);
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

        if (!keys instanceof Set)
            keys = new Set(keys);
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
     *
     * @constructor
     */
    constructor(name,param) {
        super(name);
        this.keyAddresses = new Set();
        this.keyRecords = new t.GenericMap();

        if(param instanceof crypto.KeyAddress) {
            this.keyAddresses.add(param);
        } else if(param instanceof crypto.PublicKey) {
            this.keyRecords.set(param,new KeyRecord(param));
        } else if(param instanceof crypto.PrivateKey) {
            this.keyRecords.set(param.publicKey,new KeyRecord(param.publicKey));
        } else if(param instanceof Array || param instanceof Set) {
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

    deserialize(data, deserializer) {
        Object.getPrototypeOf(SimpleRole.prototype).deserialize.call(this,data,deserializer);

        for(let key of deserializer.deserialize(data.keys)) {
            this.keyRecords.set(key.key,new KeyRecord(key.key));
        }

        for(let address of deserializer.deserialize(data.addresses)) {
            this.keyAddresses.add(address);
        }

    }

    serialize(serializer) {
        let data = Object.getPrototypeOf(SimpleRole.prototype).serialize.call(this,serializer);

        let array = [];
        for (let [k,v] of this.keyRecords) {
            array.push(v);
        }
        data.keys = serializer.serialize(array);
        data.addresses = serializer.serialize(this.keyAddresses);

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


dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("RoleLink",RoleLink));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ListRole",ListRole));
dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("SimpleRole",SimpleRole));


const RoleExtractor = {
    extractKeys : function (role) {
        if(role instanceof SimpleRole) {
            return new Set(role.keyRecords.keys());
        } else if(role instanceof RoleLink) {
            return this.extractKeys(role.resolve());
        } else if(role instanceof ListRole) {
            let result = new Set();
            role.roles.forEach(r => {
                let extracted = this.extractKeys(r);
                extracted.forEach(e => result.add(e));
            });
            return result;
        }
    },

    extractAddresses : function (role) {
        if(role instanceof SimpleRole) {
            return role.keyAddresses;
        } else if(role instanceof RoleLink) {
            return this.extractAddresses(role.resolve());
        } else if(role instanceof ListRole) {
            let result = new Set();
            role.roles.forEach(r => {
                let extracted = this.extractAddresses(r);
                extracted.forEach(e => result.add(e));
            });
            return result;
        }
    }
};

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {RequiredMode,Role,RoleLink,ListRoleMode,ListRole,SimpleRole,RoleExtractor};