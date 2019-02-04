const bs = require("biserializable");
const dbm = require("defaultbimapper");
const t = require("tools");
const KeyRecord = require("keyrecord").KeyRecord;


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
    this.requiredAllReferences = new Set();
    this.requiredAnyReferences = new Set();


    this.contract = null;
}

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

    if(!t.valuesEqual(this.requiredAllReferences,to.requiredAllReferences))
        return false;
    if(!t.valuesEqual(this.requiredAllReferences,to.requiredAnyReferences))
        return false;

    return true;
};

Role.prototype.isAllowedForKeys = function(keys) {
    return this.isAllowedForReferences(this.contract == null ? new Set() : this.contract.validRoleReferences)
};

Role.prototype.isAllowedForReferences = function(references) {

    for(let ref of this.requiredAllReferences) {
        if (!references.has(ref)) {
            return false;
        }
    }

    if(this.requiredAnyReferences.size == 0)
        return true;

    for(let ref of this.requiredAnyReferences) {
        if (references.has(ref)) {
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
                array.forEach(item => this.requiredAllReferences.add(item))
            }

            if(required.hasOwnProperty(RequiredMode.ANY_OF)) {
                let array = deserializer.deserialize(required[RequiredMode.ANY_OF]);
                array.forEach(item => this.requiredAnyReferences.add(item))
            }
        }
    }
};

Role.prototype.serialize = function(serializer) {
    return {name:this.name};
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

    if(!t.valuesEqual(this.roles,to.roles))
        return false;


    return true;
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
    }
}

SimpleRole.prototype = Object.create(Role.prototype);

SimpleRole.prototype.isValid = function() {
    return this.keyRecords.size > 0 || this.keyAddresses.size > 0 ||
        this.requiredAllReferences.size > 0 || this.requiredAnyReferences.size > 0;
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

    let array = [];;
    for(let [k,v] of this.keyRecords) {
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