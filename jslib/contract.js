const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const t = require("tools");
const TransactionPack = require("transactionpack").TransactionPack;
const Quantiser = require("quantiser").Quantiser;
const Boss = require('boss.js');


const MAX_API_LEVEL = 3;

function Context(base) {
    this.base = base;
    this.siblings = new Set();
}

function State(contract) {
    bs.BiSerializable.call(this);
    this.contract = contract;
    this.revision = 1;
    if(contract.definition) {
        this.createdAt = contract.definition.createdAt;
    } else {
        this.createdAt = null;
    }
    this.expiresAt = null;
    this.origin = null;
    this.parent = null;
    this.data = {};
    this.branchId = null;
    this.references = [];

    //TODO:setJS
}


State.prototype = Object.create(bs.BiSerializable.prototype);


State.prototype.serialize = function(serializer) {
    let of = {
        created_at: this.createdAt,
        revision: this.revision,
        owner: this.contract.roles.owner,
        created_by: this.contract.roles.creator,
        branch_id: this.branchId,
        origin : this.origin,
        parent : this.parent,
        data : this.data
    };

    if (this.expiresAt != null)
        of.expires_at = this.expiresAt;

    if (this.references != null)
        of.references = this.references;

    return serializer.serialize(of);
};

State.prototype.deserialize = function(data,deserializer) {
    this.createdAt = deserializer.deserialize(data.created_at);
    if(data.hasOwnProperty("expires_at"))
        this.expiresAt = deserializer.deserialize(data.expires_at);
    else
        this.expiresAt = null;

    this.revision = data.revision;
    if (this.revision <= 0)
        throw "illegal revision number: " + this.revision;


    if(data.hasOwnProperty("references"))
        this.references = deserializer.deserialize(data.references);
    else
        this.references = [];

    let r = this.contract.registerRole(deserializer.deserialize(data.owner))
    if(r.name !== "owner")
        throw "bad owner role name";

    r = this.contract.registerRole(deserializer.deserialize(data.created_by))
    if(r.name !== "creator")
        throw "bad creator role name";

    if(data.hasOwnProperty("data"))
        this.data = data.data;
    else
        this.data = {};



    if(data.hasOwnProperty("branch_id"))
        this.branchId = data.branch_id;
    else
        this.branchId = {};


    if(data.hasOwnProperty("parent") && data.parent != null)
        this.parent = deserializer.deserialize(data.parent);
    else
        this.parent = null;

    if(data.hasOwnProperty("origin") && data.origin != null)
        this.origin = deserializer.deserialize(data.origin);
    else
        this.origin = null;
};




function Definition(contract) {
    bs.BiSerializable.call(this);
    this.contract = contract;
    this.createdAt = new Date();
    this.expiresAt = null;
    this.data = {};
    this.references = [];
    this.extendedType = null;
    this.permissions = new Map();

    //TODO:setJS
}

Definition.prototype = Object.create(bs.BiSerializable.prototype);

Definition.prototype.serialize = function(serializer) {

    let pb = {};
    for (let plist of this.permissions.values()) {
        for (let perm of plist) {
            if (perm.id == null)
                throw "permission without id: " + perm;
            if (pb.hasOwnProperty(perm.id))
                throw "permission: duplicate permission id found: " + perm;
            pb[perm.id] = perm;
        }
    }

    let of = {
        issuer: this.contract.roles.issuer,
        created_at: this.createdAt,
        data: this.data,
        permissions: pb
    };

    if (this.expiresAt != null)
        of.expires_at = this.expiresAt;

    if (this.references != null)
        of.references = this.references;

    if (this.extendedType != null)
        of.extended_type = this.extendedType;

    return serializer.serialize(of);
};

Definition.prototype.deserialize = function(data,deserializer) {
    let r = this.contract.registerRole(deserializer.deserialize(data.issuer));
    if(r.name !== "issuer")
        throw "issuer creator role name";

    this.createdAt = deserializer.deserialize(data.created_at);
    if(data.hasOwnProperty("expires_at")) {
        this.expiresAt = deserializer.deserialize(data.expires_at);
    } else {
        this.expiresAt = null;
    }

    if(data.hasOwnProperty("extended_type")) {
        this.extendedType = data.extended_type;
    } else {
        this.extendedType = null;
    }


    if(data.hasOwnProperty("data")) {
        this.data = data.data;
    } else {
        this.data = {};
    }

    if(data.hasOwnProperty("references")) {
        this.references = deserializer.deserialize(data.references);
    } else {
        this.references = [];
    }


    let perms = deserializer.deserialize(data.permissions);
    for(let pid in perms) {
        perms[pid].id = pid;
        this.addPermission(perms[pid]);
    }
};

Definition.prototype.addPermission = function (permission) {
    if (permission.id == null) {
        if (this.permissionIds == null) {
            this.permissionIds = new Set();

            for (let plist of this.permissions.values()) {
                for (let perm of plist) {
                    this.permissionIds.add(perm.id);
                }
            }
        }

        while (true) {
            let id = t.randomString(6);
            if (!this.permissionIds.has(id)) {
                this.permissionIds.add(id);
                permission.id = id;
                break;
            }
        }
    }
    if(!this.permissions.has(permission.name)) {
        this.permissions.set(permission.name,[]);
    }
    this.permissions.get(permission.name).push(permission);
};


///////////////////////////
//Contract
///////////////////////////

function Contract() {
    this.revokingItems = new Set();
    this.newItems = new Set();
    this.roles = {};
    this.definition = new Definition(this);
    this.state = new State(this);
    this.transactional = null;
    this.sealedBinary = null;
    this.apiLevel = MAX_API_LEVEL;
    this.context = null;
    this.shouldBeU = false;
    this.limitedForTestnet = false;
    this.isSuitableForTestnet = false;
    this.isNeedVerifySealedKeys = false;
    this.sealedByKeys = new Map();
    this.effectiveKeys = new Map();
    this.keysToSignWith = new Set();
    this.references = new Map();
    this.id = null;
    this.transactionPack = null;
    this.validRoleReferences = new Set();
    this.quantiser = new Quantiser();
}

Contract.prototype = Object.create(bs.BiSerializable.prototype);
Contract.testQuantaLimit = -1;
Contract.JSAPI_SCRIPT_FIELD = "scripts";

Contract.fromPrivateKey = function(key) {
    //TODO:
};


Contract.prototype.setOwnBinary = function(result) {
    if(result.signatures.length == 0) {
        result.salt = null; //TODO: 12 random bytes
    } else {
        delete  result.salt;
    }
    this.sealedBinary = Boss.pack(result);
    this.transactionPack = null;
    this.id = HashId.of(this.sealedBinary);
}

Contract.fromSealedBinary = function(sealed,transactionPack) {
    let result = new Contract();
    if(!transactionPack)
        transactionPack = new TransactionPack(result);

    result.sealedBinary = sealed;
    result.transactionPack = transactionPack;
    result.isNeedVerifySealedKeys = true;
    let data = Boss.load(sealed);
    if(data.type !== "unicapsule") {
        throw "wrong object type, unicapsule required";
    }

    result.apiLevel = data.version;
    let contractBytes = data.data;
    let payload = Boss.load(contractBytes,null);
    result.deserialize(payload.contract,BossBiMapper.getInstance());

    if(result.apiLevel < 3) {
        if(payload.hasOwnProperty("revoking"))
            for(let packed of payload.revoking) {
                let c = Contract.fromSealedBinary(packed,transactionPack);
                result.revokingItems.add(c);
                transactionPack.addSubItem(c);
            }

        if(payload.hasOwnProperty("new"))
            for(let packed of payload.new) {
                let c = Contract.fromSealedBinary(packed,transactionPack);
                result.newItems.add(c);
                transactionPack.addSubItem(c);
            }
    } else {
        if(payload.hasOwnProperty("revoking"))
            for(let b of payload.revoking) {
                let hid = HashId.withDigest(b.composite3);
                let r = transactionPack.getSubItem(hid);
                if(r != null) {
                    result.revokingItems.add(r);
                } else {
                    result.addError(Errors.BAD_REVOKE,"Revoking item was not found in the transaction pack")
                }
            }

        if(payload.hasOwnProperty("new"))
            for(let b of payload.new) {
                let hid = HashId.withDigest(b.composite3);
                let r = transactionPack.getSubItem(hid);
                if(r != null) {
                    result.newItems.add(r);
                } else {
                    result.addError(Errors.BAD_NEW_ITEM,"New item was not found in the transaction pack")
                }
            }
    }
    if (result.context == null) {
        result.context = new Context(result.getRevokingItem(result.state.parent));
        result.context.siblings.add(this);
        for(let i of result.newItems) {
            if (i.state.parent != null && t.valuesEqual(result.state.parent,i.state.parent)) {
                result.context.siblings.add(i);
            }
            i.context = result.context;
        }
    }
    return result;
};

Contract.prototype.seal = function() {
    let revokingIds = [];
    for(let ri of this.revokingItems) {
        revokingIds.push(ri.id);
    }

    let newIds = [];
    for(let ni of this.newItems) {
        newIds.push(ni.id);
    }

    let forPack = BossBiMapper.serialize(
        {
            "contract" : this,
            "revoking" : revokingIds,
            "new" : newIds
        }
    );

    let contractBytes = Boss.dump(forPack);

    let signatures = [];
    let result = {
        type: "unicapsule",
        version: 3,
        data: contractBytes,
        signatures: signatures
    }
    this.setOwnBinary(result);

    this.addSignatureToSeal(this.keysToSignWith);

    return this.sealedBinary;
}

Contract.fromSealedV2Binary = function(sealed,data,transactionPack) {

    //TODO:
};

Contract.prototype.sealV2 = function() {
    //TODO:
    /*byte[] theContract = Boss.pack(
        BossBiMapper.serialize(
            Binder.of(
                "contract", this,
                "revoking", revokingItems.stream()
                    .map(i -> i.getLastSealedBinary())
                    .collect(Collectors.toList()),
                "new", newItems.stream()
                    .map(i -> i.seal())
                    .collect(Collectors.toList())
            )
        )
    );
    //redundand code. already executed here newItems.stream().map(i -> i.seal())
    //newItems.forEach(c -> c.seal());
    Binder result = Binder.of(
        "type", "unicapsule",
        "version", 2,
        "data", theContract
    );
    List<byte[]> signatures = new ArrayList<>();
    keysToSignWith.forEach(key -> {
        signatures.add(ExtendedSignature.sign(key, theContract));
    });
    result.put("signatures", signatures);
    setOwnBinary(result);
    return sealedBinary;*/
}

Contract.prototype.serialize = function(serializer) {
    let binder = {
        api_level: this.apiLevel,
        definition : this.definition.serialize(serializer),
        state : this.state.serialize(serializer)
    };

    if(this.transactional != null)
        binder.transactional = this.transactional.serialize(serializer);

    return binder;
};

Contract.prototype.deserialize = function(data,deserializer) {
    let l = data.api_level;
    if (l > MAX_API_LEVEL)
        throw "contract api level conflict: found " + l + " my level " + this.apiLevel;

    if (this.definition == null)
        this.definition = new Definition(this);
    this.definition.deserialize(data.definition, deserializer);

    if (this.state == null)
        this.state = new State();
    this.state.deserialize(data.state, deserializer);

    if (data.hasOwnProperty("transactional")) {
        if (this.transactional == null)
            this.transactional = new Transactional();
        this.transactional.deserialize(data.transactional, deserializer);
    } else {
        this.transactional = null;
    }

    if (this.transactional != null && this.transactional.references != null) {
        for(let ref of this.transactional.references) {
            ref.setContract(this);
            this.references.put(ref.name, ref);
        }
    }

    if (this.definition != null && this.definition.references != null) {
        for(let ref of this.definition.references) {
            ref.setContract(this);
            this.references.put(ref.name, ref);
        }
    }

    if (this.state != null && this.state.references != null) {
        for(let ref of this.state.references) {
            ref.setContract(this);
            this.references.put(ref.name, ref);
        }
    }
};

Contract.prototype.registerRole = function(role) {
    this.roles[role.name] = role;
    role.contract = this;
    return role;
};

Contract.prototype.getRevokingItem = function(id) {
    for(let ri in this.revokingItems) {
        if(t.valuesEqual(ri.id,id)) {
            return ri;
        }
    }

    return null;
};

Contract.prototype.addSignatureToSeal = function(x) {
    let keys;
    if(Object.getPrototypeOf(x) === Array.prototype) {
        keys = x;
    } else if(Object.getPrototypeOf(x) === PrivateKey.prototype){
        keys = [];
        keys.push(x);
    } else {
        throw "Invalid param " + x + ". Should be either PrivateKey or Array of PrivateKey";
    }

    //TODO:
};



DefaultBiMapper.registerAdapter(new bs.BiAdapter("UniversaContract",Contract));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Contract};