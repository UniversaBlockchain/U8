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


function Role(name) {
    this.name = name;
    this.comment = null;
    bs.BiSerializable.call(this);
    this.requiredAllConstraints = new Set();
    this.requiredAnyConstraints = new Set();

    this.contract = null;
}

Role.fromDsl = function (name, serializedRole) {
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
        throw new ex.IllegalArgumentException("Unknown role type: " + type);

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
};

Role.prototype = Object.create(bs.BiSerializable.prototype);

Role.prototype.isValid = function() {
    return false;
};

Role.prototype.equals = function(to) {
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
};

Role.prototype.equalsForConstraint = function(to) {
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
};

Role.prototype.containConstraint = function(name) {
    return (this.requiredAllConstraints.has(name) || this.requiredAnyConstraints.has(name));
};

Role.prototype.isAllowedForKeys = function(keys) {
    return this.isAllowedForConstraints(this.contract == null ? new Set() : this.contract.validRoleConstraints)
};

Role.prototype.isAllowedForConstraints = function(constraints) {

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
};


Role.prototype.deserialize = function (data, deserializer) {
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
};

Role.prototype.serialize = function(serializer) {
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
};

Role.prototype.linkAs = function (linkName) {
    let newRole = new RoleLink(linkName, name);
    if (this.contract != null)
        this.contract.registerRole(newRole);
    return newRole;
};



///////////////////////////
//RoleLink
///////////////////////////

function RoleLink(name,roleName) {
    Role.call(this,name);
    this.roleName = roleName;
}
RoleLink.prototype = Object.create(Role.prototype);

RoleLink.prototype.isValid = function() {
    let r = this.resolve();
    if(r != null)
        return r.isValid();
    else
        return false;
};

RoleLink.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    if(!Object.getPrototypeOf(RoleLink.prototype).equals.call(this,to))
        return false;

    if(!t.valuesEqual(this.roleName,to.roleName))
        return false;

    return true;
};

RoleLink.prototype.equalsForConstraint = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    if(!Object.getPrototypeOf(RoleLink.prototype).equalsForConstraint.call(this,to))
        return false;

    if(!t.valuesEqual(this.roleName,to.roleName))
        return false;

    return true;
};

RoleLink.prototype.containConstraint = function(name) {
    if (Object.getPrototypeOf(RoleLink.prototype).containConstraint.call(this, name))
        return true;

    if (this.contract == null || this.contract.roles.hasOwnProperty(this.roleName))
        return false;

    return this.contract.roles[this.roleName].containConstraint(name);
};

RoleLink.prototype.deserialize = function(data,deserializer) {
    Object.getPrototypeOf(RoleLink.prototype).deserialize.call(this,data,deserializer);
    this.roleName = data.target_name;
};

RoleLink.prototype.serialize = function(serializer) {
    let data = Object.getPrototypeOf(RoleLink.prototype).serialize.call(this,serializer);
    data.target_name = this.roleName;
    return data;
};

RoleLink.prototype.getRole = function() {
    return this.contract.roles[this.roleName];
};

RoleLink.prototype.resolve = function() {
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
};

RoleLink.prototype.isAllowedForKeys = function(keys) {
    if(!Object.getPrototypeOf(RoleLink.prototype).isAllowedForKeys.call(this,keys))
        return false;
    let r = this.resolve();
    if(r != null)
        return r.isAllowedForKeys(keys);
    else
        return false;
};

RoleLink.prototype.initWithDsl = function(serializedRole) {
    if (serializedRole.hasOwnProperty("target"))
        this.roleName = serializedRole.target;
    else
        throw new ex.IllegalArgumentException("Unknown target of RoleLink");

    if (this.name === this.roleName)
        throw new ex.IllegalArgumentException("RoleLink: name and target name are equals: " + this.roleName);

};



///////////////////////////
//ListRole
///////////////////////////

const ListRoleMode = {
    ALL : "ALL",
    ANY : "ANY",
    QUORUM : "QUORUM"
};


function ListRole(name) {
    Role.call(this,name);
    this.mode = ListRoleMode.ALL;
    this.roles = [];
    this.quorumSize = 0;
}

ListRole.prototype = Object.create(Role.prototype);

ListRole.prototype.isValid = function() {
    return this.roles.length > 0 && (this.mode !== ListRoleMode.QUORUM || this.quorumSize <= this.roles.length);
};


ListRole.prototype.equals = function(to) {
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
};

ListRole.prototype.equalsForConstraint = function(to) {
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
};

ListRole.prototype.containConstraint = function(name) {
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
};

ListRole.prototype.deserialize = function(data,deserializer) {
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
};

ListRole.prototype.serialize = function(serializer) {
    let data = Object.getPrototypeOf(ListRole.prototype).serialize.call(this,serializer);
    data.quorumSize = this.quorumSize;
    data.mode = ListRoleMode[this.mode];
    data.roles = serializer.serialize(this.roles);
    return data;
};

ListRole.prototype.isAllowedForKeys = function(keys) {
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
    keys = new Set(keys);
    for(let r of this.roles) {
        if(r.isAllowedForKeys(keys)) {
            valid++;
            if(valid >= required)
                return true;
        }
    }

    return false;
};

ListRole.prototype.initWithDsl = function(serializedRole) {
    if (!serializedRole.hasOwnProperty("roles"))
        throw new ex.IllegalArgumentException("Unknown roles of ListRole");

    if (!serializedRole.hasOwnProperty("mode"))
        throw new ex.IllegalArgumentException("Unknown mode of ListRole");

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
};



///////////////////////////
//SimpleRole
///////////////////////////

function SimpleRole(name,param) {
    Role.call(this,name);
    this.keyAddresses = new Set();
    this.keyRecords = new t.GenericMap();

    if(param instanceof crypto.KeyAddress) {
        this.keyAddresses.add(param);
    } else if(param instanceof crypto.PublicKey) {
        this.keyRecords.set(param,new KeyRecord(param));
    } else if(param instanceof Array || param instanceof Set) {
        for(let p of param) {
            if(p instanceof crypto.KeyAddress) {
                this.keyAddresses.add(p);
            } else if(p instanceof crypto.PublicKey) {
                this.keyRecords.set(p,new KeyRecord(p));
            }
        }
    }
}

SimpleRole.prototype = Object.create(Role.prototype);

SimpleRole.prototype.isValid = function() {
    return this.keyRecords.size > 0 || this.keyAddresses.size > 0 ||
        this.requiredAllConstraints.size > 0 || this.requiredAnyConstraints.size > 0;
};

SimpleRole.prototype.equals = function(to) {
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
};

SimpleRole.prototype.equalsForConstraint = function(to) {
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
};

SimpleRole.prototype.hasAllKeys = function(to) {
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
};

SimpleRole.prototype.deserialize = function(data,deserializer) {
    Object.getPrototypeOf(SimpleRole.prototype).deserialize.call(this,data,deserializer);

    for(let key of deserializer.deserialize(data.keys)) {
        this.keyRecords.set(key.key,new KeyRecord(key.key));
    }

    for(let address of deserializer.deserialize(data.addresses)) {
        this.keyAddresses.add(address);
    }

};

SimpleRole.prototype.serialize = function(serializer) {
    let data = Object.getPrototypeOf(SimpleRole.prototype).serialize.call(this,serializer);

    let array = [];
    for (let [k,v] of this.keyRecords) {
        array.push(v);
    }
    data.keys = serializer.serialize(array);
    data.addresses = serializer.serialize(this.keyAddresses);

    return data;
};

SimpleRole.prototype.isAllowedForKeys = function(keys) {
    if(!Object.getPrototypeOf(SimpleRole.prototype).isAllowedForKeys.call(this,keys))
        return false;


    for(let key of this.keyRecords.keys()) {
        let found = false;
        for(let k of keys) {
            if(t.valuesEqual(k,key)) {
                found = true;
                break;
            }
        }
        if(!found)
            return false;
    }


    for(let address of this.keyAddresses) {
        let found = false;
        for(let k of keys) {
            if(address.match(k)) {
                found = true;
                break;
            }
        }
        if(!found)
            return false;
    }

    return true;
};

SimpleRole.prototype.addKeyRecord = function(keyRecord) {
    this.keyRecords.set(keyRecord.key, keyRecord);
};

SimpleRole.prototype.initWithDsl = function(serializedRole) {
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
};


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