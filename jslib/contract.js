const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const t = require("tools");
const TransactionPack = require("transactionpack").TransactionPack;
const q = require("quantiser");
const Quantiser = q.Quantiser;
const QuantiserProcesses = q.QuantiserProcesses;
const QuantiserException = q.QuantiserException;
const Boss = require('boss.js');
const roles = require('roles');
const constr = require('constraint');
const permissions = require('permissions');
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const Config = require("config").Config;
const ContractDelta = require("contractdelta").ContractDelta;
const ExtendedSignature = require("extendedsignature").ExtendedSignature;

const MAX_API_LEVEL = 3;

function Context(base) {
    this.base = base;
    this.siblings = new Set();
}

function Transactional(contract) {
    this.contract = contract;
    this.id = null;
    this.constraints = [];
    this.validUntil = null;
    this.data = {};
}

Transactional.prototype.serialize = function(serializer) {

    let b = {
        id: this.id,
        constraints : serializer.serialize(this.constraints),
        data : this.data,
    };

    if (this.validUntil != null)
        b.valid_until = this.validUntil;

    return b;
};

Transactional.prototype.deserialize = function(data,deserializer) {
    if(data != null) {
        this.id = data.id;

        if (data.hasOwnProperty("constraints"))
            this.constraints = deserializer.deserialize(data.constraints);
        else if (data.hasOwnProperty("references"))
            this.constraints = deserializer.deserialize(data.references);

        if(data.hasOwnProperty("valid_until")) {
            this.validUntil = data.valid_until;
        }


        this.data = data.data;
    }
};

Transactional.prototype.addConstraint = function(c) {
    this.constraints.push(c);
};


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
    this.constraints = [];

    //TODO:setJS
}


State.prototype = Object.create(bs.BiSerializable.prototype);

State.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    if(!t.valuesEqual(this.revision,to.revision))
        return false;

    if(!t.valuesEqual(this.createdAt,to.createdAt))
        return false;

    if(!t.valuesEqual(this.expiresAt,to.expiresAt))
        return false;

    if(!t.valuesEqual(this.origin,to.origin))
        return false;

    if(!t.valuesEqual(this.parent,to.parent))
        return false;

    if(!t.valuesEqual(this.data,to.data))
        return false;

    if(!t.valuesEqual(this.branchId,to.branchId))
        return false;

    return true;
};

State.prototype.getBranchRevision = function() {
    if (this.branchId == null)
        return 0;
    else
        return parseInt(this.branchId.split(":")[0])
};


State.prototype.setBranchNumber = function (number) {
    this.branchId = this.revision + ":" + number;
};


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

    if (this.constraints != null)
        of.constraints = serializer.serialize(this.constraints);

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

    if (data.hasOwnProperty("constraints"))
        this.constraints = deserializer.deserialize(data.constraints);
    else if (data.hasOwnProperty("references"))
        this.constraints = deserializer.deserialize(data.references);
    else
        this.constraints = [];

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

State.prototype.addConstraint = function(c) {
    this.constraints.push(c);
};


function Definition(contract) {
    bs.BiSerializable.call(this);
    this.contract = contract;
    this.createdAt = new Date();
    this.createdAt.setMilliseconds(0);
    this.expiresAt = null;
    this.data = {};
    this.constraints = [];
    this.extendedType = null;
    this.permissions = new Map();

    //TODO:setJS
}

Definition.prototype = Object.create(bs.BiSerializable.prototype);


Definition.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    if(!t.valuesEqual(this.createdAt,to.createdAt))
        return false;

    if(!t.valuesEqual(this.expiresAt,to.expiresAt))
        return false;

    if(!t.valuesEqual(this.data,to.data))
        return false;

    if(!t.valuesEqual(this.constraints,to.constraints))
        return false;

    if(!t.valuesEqual(this.extendedType,to.extendedType))
        return false;


    if(!t.valuesEqual(this.permissions,to.permissions))
        return false;

    return true;

};

Definition.prototype.serialize = function(serializer) {

    let pb = {};
    for (let plist of this.permissions.values()) {
        for (let perm of plist) {
            if (perm.id == null)
                throw "permission without id: " + perm;
            if (pb.hasOwnProperty(perm.id))
                throw "permission: duplicate permission id found: " + perm;
            pb[perm.id] = serializer.serialize(perm);
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

    if (this.constraints != null)
        of.constraints = serializer.serialize(this.constraints);

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

    if (data.hasOwnProperty("constraints"))
        this.constraints = deserializer.deserialize(data.constraints);
    else if (data.hasOwnProperty("references"))
        this.constraints = deserializer.deserialize(data.references);
    else
        this.constraints = [];

    let perms = deserializer.deserialize(data.permissions);
    for(let pid of Object.keys(perms)) {
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
    permission.role.contract = this.contract;
    this.permissions.get(permission.name).push(permission);
};

Definition.prototype.addConstraint = function(c) {
    this.constraints.push(c);
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
    this.errors = [];
    this.shouldBeU = false;
    this.limitedForTestnet = false;
    this.isSuitableForTestnet = false;
    this.isNeedVerifySealedKeys = false;
    this.sealedByKeys = new t.GenericMap();
    this.effectiveKeys = new Map();
    this.keysToSignWith = new Set();
    this.constraints = new Map();
    this.id = null;
    this.transactionPack = null;
    this.validRoleConstraints = new Set();
    this.quantiser = new Quantiser();
}

Contract.prototype = Object.create(bs.BiSerializable.prototype);
Contract.testQuantaLimit = -1;
Contract.JSAPI_SCRIPT_FIELD = "scripts";

Contract.fromPrivateKey = function(key) {
    let c = new Contract();
    let now = new Date();
    now.setTime((Math.floor(now.getTime()/1000)+90*24*3600)*1000);
    now.setMilliseconds(0);
    c.state.expiresAt = now;
    let issuer = new roles.SimpleRole("issuer");
    issuer.keyAddresses.add(key.publicKey.longAddress);
    c.registerRole(issuer);
    let owner = new roles.RoleLink("owner","issuer");
    c.registerRole(owner);
    let creator = new roles.RoleLink("creator","issuer");
    c.registerRole(creator);

    let chown = new roles.RoleLink("@change_ower_role","owner");
    chown.contract = c;
    c.definition.addPermission(new permissions.ChangeOwnerPermission(chown));
    c.keysToSignWith.add(key);
    return c;
};


Contract.prototype.setOwnBinary = function(result) {
    let tpBackup = null;
    if(this.transactionPack != null && this.transactionPack.contract === this) {
        tpBackup = this.transactionPack;
    }

    if(result.signatures.length === 0) {
        result.salt = null; //TODO: 12 random bytes
    } else {
        delete  result.salt;
    }
    this.sealedBinary = Boss.dump(result);
    this.id = crypto.HashId.of(this.sealedBinary);
    if(tpBackup == null) {
        this.transactionPack = null;
    } else {
        this.transactionPack = new TransactionPack(this);
        for(let [k,v] of tpBackup.referencedItems) {
            this.transactionPack.referencedItems.set(k,v);
        }
    }
}

Contract.fromSealedBinary = function(sealed,transactionPack) {
    let result = new Contract();
    if(!transactionPack)
        transactionPack = new TransactionPack(result);

    result.sealedBinary = sealed;
    result.id = crypto.HashId.of(sealed);
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
                let hid = BossBiMapper.getInstance().deserialize(b);
                let r = transactionPack.subItems.get(hid);
                if(r != null) {
                    result.revokingItems.add(r);
                } else {

                    result.errors.push(new ErrorRecord(Errors.BAD_REVOKE,"Revoking item was not found in the transaction pack"));
                }
            }

        if(payload.hasOwnProperty("new"))
            for(let b of payload.new) {
                let hid = BossBiMapper.getInstance().deserialize(b);
                let r = transactionPack.subItems.get(hid);
                if(r != null) {
                    result.newItems.add(r);
                } else {
                    result.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM,"New item was not found in the transaction pack"));
                }
            }
    }
    result.updateContext();
    return result;
};

Contract.prototype.updateContext = function() {
    if (this.context == null) {
        this.context = new Context(this.getRevokingItem(this.state.parent));
        this.context.siblings.add(this);
        for(let i of this.newItems) {
            if (i.state.parent != null && t.valuesEqual(this.state.parent,i.state.parent)) {
                this.context.siblings.add(i);
            }
            i.context = this.context;
        }
    }
};

/**
 * Get contract constraint with given name
 * @param name name of the constraint
 * @return found constraint or null
 */
Contract.prototype.findConstraintByName = function(name) {
    return this.constraints.get(name);
};

/**
 * Get contract constraint with given name in given section
 * @param {string} name name of the constraint
 * @param {string} section section to search in
 * @return found constraint or null
 */
Contract.prototype.findConstraintByNameInSection = function(name, section) {
    if (section === "definition") {
        if (this.definition.constraints == null)
            return null;

        for (let constr of this.definition.constraints)
            if (constr.name === name)
                return constr;

        return null;
    } else if (section === "state") {
        if (this.state.constraints == null)
            return null;

        for (let constr of this.state.constraints)
            if (constr.name === name)
                return constr;

        return null;
    } else if (section === "transactional") {
        if ((this.transactional == null) || (this.transactional.constraints == null))
            return null;

        for (let constr of this.transactional.constraints)
            if (constr.name === name)
                return constr;

        return null;
    }
    return null;
};

Contract.prototype.get = function(name) {
    let originalName = name;
    if (name.startsWith("definition.")) {
        name = name.substring(11);
        switch (name) {
            case "expires_at":
                return this.definition.expiresAt;
            case "created_at":
                return this.definition.createdAt;
            case "extended_type":
                return this.definition.extendedType;
            case "issuer":
                return this.roles.issuer;
            default:
                if (name.startsWith("data."))
                    if(this.definition.data.hasOwnProperty(name.substring(5))) {
                        return this.definition.data[name.substring(5)];
                    } else {
                        return null;
                    }

                if (name.startsWith("constraints."))
                    return this.findConstraintByNameInSection(name.substring(12), "definition");
                else if (name.startsWith("references."))
                    return this.findConstraintByNameInSection(name.substring(11), "definition");
        }
    } else if (name.startsWith("state.")) {
        name = name.substring(6);
        switch (name) {
            case "origin":
                return this.state.origin;
            case "created_at":
                return this.state.createdAt;
            case "expires_at":
                return this.state.expiresAt;
            case "owner":
                return this.roles.owner;
            case "creator":
                return this.roles.creator;
            case "revision":
                return this.state.revision;
            case "parent":
                return this.state.parent;
            case "branchId":
                return this.state.branchId;
            default:
                if (name.startsWith("data."))
                    if(this.state.data.hasOwnProperty(name.substring(5))) {
                        return this.state.data[name.substring(5)];
                    } else {
                        return null;
                    }
                if (name.startsWith("constraints."))
                    return this.findConstraintByNameInSection(name.substring(12), "state");
                else if (name.startsWith("references."))
                    return this.findConstraintByNameInSection(name.substring(11), "state");
        }
    } else if (name.startsWith("transactional.")) {
        if (this.transactional != null) {
            name = name.substring(14);
            switch (name) {
                case "id":
                    return this.transactional.id;
                case "validUntil":
                    return this.transactional.validUntil;
                default:
                    if (name.startsWith("data."))
                        if(this.transactional.data.hasOwnProperty(name.substring(5))) {
                            return this.transactional.data[name.substring(5)];
                        } else {
                            return null;
                        }
                    if (name.startsWith("constraints."))
                        return this.findConstraintByNameInSection(name.substring(12), "transactional");
                    else if (name.startsWith("references."))
                        return this.findConstraintByNameInSection(name.substring(11), "transactional");
            }
        }
    } else switch (name) {
        case "id":
            return this.id;
        case "origin":
            return this.state.origin;
        case "issuer":
            return this.roles.issuer;
        case "owner":
            return this.roles.owner;
        case "creator":
            return this.roles.creator;
    }
    throw "bad root: " + originalName;

};


Contract.prototype.seal = async function(isTransactionRoot) {
    let revokingIds = [];
    for(let ri of this.revokingItems) {
        revokingIds.push(ri.id);
    }

    let newIds = [];
    for(let ni of this.newItems) {
        if(ni.sealedBinary == null) {
            await ni.seal();
        }
        newIds.push(ni.id);
    }

    let forPack = BossBiMapper.getInstance().serialize(
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

    await this.addSignatureToSeal(this.keysToSignWith);

    if(isTransactionRoot)
        this.transactionPack = new TransactionPack(this);

    return this.sealedBinary;
};

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

    //    console.log(JSON.stringify(binder));

    return binder;
};

Contract.prototype.deserialize = function(data,deserializer) {
    //console.log(JSON.stringify(data));


    let l = data.api_level;
    if (l > MAX_API_LEVEL)
        throw "contract api level conflict: found " + l + " my level " + this.apiLevel;

    if (this.definition == null)
        this.definition = new Definition(this);
    this.definition.deserialize(data.definition, deserializer);



    this.state.deserialize(data.state, deserializer);

    if (data.hasOwnProperty("transactional")) {
        if (this.transactional == null)
            this.transactional = new Transactional();
        this.transactional.deserialize(data.transactional, deserializer);
    } else {
        this.transactional = null;
    }

    if (this.transactional != null && this.transactional.constraints != null) {
        for(let constr of this.transactional.constraints) {
            constr.setContract(this);
            this.constraints.set(constr.name, constr);
        }
    }

    if (this.definition != null && this.definition.constraints != null) {
        for(let constr of this.definition.constraints) {
            constr.setContract(this);
            this.constraints.set(constr.name, constr);
        }
    }

    if (this.state != null && this.state.constraints != null) {
        for(let constr of this.state.constraints) {
            constr.setContract(this);
            this.constraints.set(constr.name, constr);
        }
    }
};

Contract.prototype.registerRole = function(role) {
    this.roles[role.name] = role;
    role.contract = this;
    return role;
};

Contract.prototype.getRevokingItem = function(id) {
    for(let ri of this.revokingItems) {
        if(t.valuesEqual(ri.id,id)) {
            return ri;
        }
    }

    return null;
};

Contract.prototype.addSignatureToSeal = async function(x) {
    let keys;
    let proto = Object.getPrototypeOf(x);
    if(proto === Array.prototype || proto === Set.prototype) {
        keys = x;
    } else if(proto === crypto.PrivateKey.prototype){
        keys = [];
        keys.push(x);
    } else {
        throw "Invalid param " + x + ". Should be either PrivateKey or Array of PrivateKey";
    }

    if(this.sealedBinary == null)
        throw "failed to add signature: sealed binary does not exist";

    keys.forEach(k => this.keysToSignWith.add(k));

    let data = Boss.load(this.sealedBinary);
    let contractBytes = data.data;
    for (let key of keys) {
        let signature = await ExtendedSignature.sign(key, contractBytes);
        await this.addSignatureBytesToSeal(signature,key.publicKey);
    }
};

Contract.prototype.addSignatureBytesToSeal = async function(signature,publicKey) {
    if(this.sealedBinary == null)
        throw "failed to add signature: sealed binary does not exist";

    let data = Boss.load(this.sealedBinary);
    //console.log(Object.getPrototypeOf(data.signatures).constructor.name);
    data.signatures.push(signature);

    let contractBytes = data.data;
    let  es = await ExtendedSignature.verify(publicKey, signature, contractBytes);
    if (es != null) {
        this.sealedByKeys.set(publicKey, es);
    }

    this.setOwnBinary(data);
};


Contract.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    if(!t.valuesEqual(this.state,to.state))
        return false;

    if(!t.valuesEqual(this.definition,to.definition))
        return false;

    if(!t.valuesEqual(this.revokingItems,to.revokingItems))
        return false;

    if(!t.valuesEqual(this.newItems,to.newItems))
        return false;

    if(!t.valuesEqual(this.roles,to.roles))
        return false;

    if(!t.valuesEqual(this.transactional,to.transactional))
        return false;

    if(!t.valuesEqual(this.sealedBinary,to.sealedBinary))
        return false;

    if(!t.valuesEqual(this.sealedByKeys,to.sealedByKeys))
        return false;

    if(!t.valuesEqual(this.constraints,to.constraints))
        return false;

    return true;
};


Contract.prototype.check = async function(prefix,contractsTree) {
    if(typeof prefix === "undefined")
        prefix = "";

    if(typeof  contractsTree === "undefined")
        contractsTree = null;

    this.quantiser.reset(this.quantiser.quantaLimit_);

    if(prefix === "")
        await this.verifySignatures();

    if (contractsTree == null) {
        contractsTree = new t.GenericMap();
        for(let [k,v] of this.transactionPack.subItems) {
            contractsTree.set(k,v);
        }

        for(let [k,v] of this.transactionPack.referencedItems) {
            contractsTree.set(k,v);
        }
        contractsTree.set(this.id,this);
        this.setEffectiveKeys(null);
    }

    this.quantiser.addWorkCost(QuantiserProcesses.PRICE_REGISTER_VERSION);
    this.quantiser.addWorkCost(QuantiserProcesses.PRICE_REVOKE_VERSION*this.revokingItems.size);
    this.quantiser.addWorkCost(QuantiserProcesses.PRICE_CHECK_CONSTRAINT*this.constraints.size);

    this.checkConstraints(contractsTree);

    this.revokingItems.forEach(ri => {
        ri.errors = [];
        ri.checkConstraints(contractsTree,true);
        ri.errors.forEach(e => {
            this.errors.push(e);
        });
    });

    try {
        this.basicCheck(prefix);

        if (this.state.origin == null)
            this.checkRootContract();
        else
            this.checkChangedContract();

    } catch (e) {
        if(t.THROW_EXCEPTIONS)
            throw e;

        if(e instanceof QuantiserException) {
            throw e;
        } else {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, prefix, e.toString()));
            throw e;
        }
    }


    let index = 0;
    for (let c of this.newItems) {
        let p = prefix + "new[" + index + "].";
        this.checkSubItemQuantized(c, p, contractsTree);
        c.errors.forEach(e => this.errors.push(e));
        index++;
    }

    if(prefix === "")
        this.checkDupesCreation(contractsTree);

    this.checkTestPaymentLimitations();

    return this.errors.length === 0;
};

Contract.prototype.getRevisionId = function() {
    let parentId = this.state.parent == null ? "" : this.state.parent.base64 + "/";
    let originId = this.state.origin == null ? this.id.base64 : this.state.origin.base64;
    let branchId = this.state.branchId == null ? "" : "/" + this.state.branchId;
    return originId + parentId + this.state.revision + branchId;
};

Contract.prototype.checkDupesCreation = function(contractsTree) {
    let revisionIds = new Set();
    for (let [id,c] of  contractsTree) {
        let cid = c.getRevisionId();
        if (revisionIds.has(cid)) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "duplicated revision id: " + cid));
        } else
            revisionIds.add(cid);
    }
};

Contract.prototype.checkTestPaymentLimitations = function() {
    let res = true;
    // we won't check U contract
    if (!this.shouldBeU) {
        this.isSuitableForTestnet = true;
        for (let key of this.effectiveKeys) {
            if (key != null) {
                if (key.bitStrength != 2048) {
                    this.isSuitableForTestnet = false;
                    if (this.limitedForTestnet) {
                        res = false;
                        this.errors.push(new ErrorRecord(Errors.FORBIDDEN,"", "Only 2048 keys is allowed in the test payment mode."));
                    }
                }
            }
        }

        let expirationLimit = new Date();
        expirationLimit.setTime(expirationLimit.getTime() + 24*3600*1000*Config.maxExpirationDaysInTestMode);

        if (this.getExpiresAt().getTime() > expirationLimit.getTime()) {
            this.isSuitableForTestnet = false;
            if (this.limitedForTestnet) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.FORBIDDEN,"", "Contracts with expiration date father then " + Config.maxExpirationDaysInTestMode + " days from now is not allowed in the test payment mode."));
            }
        }

        for (let ni of this.newItems) {
            if (ni.getExpiresAt().getTime() > expirationLimit.getTime()) {
                this.isSuitableForTestnet = false;
                if (this.limitedForTestnet) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.FORBIDDEN,"", "New items with expiration date father then " + Config.maxExpirationDaysInTestMode + " days from now is not allowed in the test payment mode."));
                }
            }
        }

        for (let ri of this.revokingItems) {
            if (ri.getExpiresAt().getTime() > expirationLimit.getTime()) {
                this.isSuitableForTestnet = false;
                if (this.limitedForTestnet) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.FORBIDDEN,"", "Revoking items with expiration date father then " + Config.maxExpirationDaysInTestMode + " days from now is not allowed in the test payment mode."));
                }
            }
        }

        if (this.getProcessedCostU() > Config.maxCostUInTestMode) {
            this.isSuitableForTestnet = false;
            if (this.limitedForTestnet) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.FORBIDDEN,"", "Contract processing can not cost more then " + Config.maxCostUInTestMode + " U in the test payment mode."));
            }
        }
    }

    return res;
};

Contract.prototype.getProcessedCostU = function() {
    return Math.ceil( this.quantiser.quantaSum_ / Quantiser.quantaPerU);
};


Contract.prototype.getExpiresAt = function() {
    return this.state.expiresAt != null ? this.state.expiresAt : this.definition.expiresAt;
};

Contract.prototype.checkSubItemQuantized = function(subitem, prefix, neighbourContracts) {
    // Add checks from subItem quanta
    subitem.quantiser.reset(this.quantiser.quantasLeft());
    subitem.check(prefix, neighbourContracts);
    this.quantiser.addWorkCostFrom(subitem.quantiser);
};

Contract.prototype.basicCheck = function(prefix) {
    if ((this.transactional != null) && (this.transactional.validUntil != null)) {
        if (this.transactional.validUntil*1000 < new Date().getTime())
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"transactional.valid_until", "time for register is over"));
        else if ((this.transactional.validUntil + Config.validUntilTailTime)*1000 < new Date().getTime())
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"transactional.valid_until", "time for register ends"));
    }

    if (this.definition.createdAt == null) {
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"definition.created_at", "invalid"));
    }

    if(this.state.origin == null){
        if (this.definition.createdAt.getTime() > new Date().getTime()) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"definition.created_at", "invalid: in future"));
        }
        if(this.definition.createdAt.getTime() < new Date().getTime()-Config.maxItemCreationAge*1000) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"definition.created_at", "invalid: too old"));
        }
    }


    if(this.definition.expiresAt == null && this.state.expiresAt == null) {
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.expires_at/definition.expires_at", "not set"));
    }

    if(this.definition.expiresAt != null && this.definition.expiresAt.getTime() < new Date().getTime()) {
        this.errors.push(new ErrorRecord(Errors.EXPIRED, "definition.expires_at", "is in the past"));
    }

    if(this.state.expiresAt != null && this.state.expiresAt.getTime() < new Date().getTime()) {
        this.errors.push(new ErrorRecord(Errors.EXPIRED, "state.expires_at", "is in the past"));
    }


    if (this.state.createdAt == null) {
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.created_at", "invalid: not set"));
    }

    if (this.state.createdAt.getTime() > new Date().getTime()) {
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.created_at", "invalid: in future"));
    }
    if(this.state.createdAt.getTime() < new Date().getTime()-Config.maxItemCreationAge*1000) {
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.created_at", "invalid: too old"));
    }


    if (this.apiLevel < 1)
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"api_level", " <  1"));

    if (this.roles.owner == null || !this.roles.owner.isValid())
        this.errors.push(new ErrorRecord(Errors.MISSING_OWNER, prefix+"state.owner", "missing or invalid"));

    if (this.roles.issuer == null || !this.roles.issuer.isValid())
        this.errors.push(new ErrorRecord(Errors.MISSING_ISSUER, prefix+"definition.issuer", "missing or invalid"));

    if (this.state.revision < 1)
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.revision", " < 1"));


    if (this.roles.creator == null || !this.roles.creator.isValid())
        this.errors.push(new ErrorRecord(Errors.MISSING_CREATOR, prefix+"state.created_by", "missing or invalid"));
    else if (!this.roles.creator.isAllowedForKeys(new Set(this.effectiveKeys.keys())))
        this.errors.push(new ErrorRecord(Errors.NOT_SIGNED, prefix, "missing creator signature(s)"));
};

Contract.prototype.checkRootContract = function(prefix) {
    //issuer presence and validity is already checked within basicCheck
    if(this.roles.issuer != null && this.roles.issuer.isValid()) {
        if (!this.roles.issuer.isAllowedForKeys(new Set(this.effectiveKeys.keys()))) {
            this.errors.push(new ErrorRecord(Errors.ISSUER_MUST_CREATE, prefix, "missing issuer signature(s)"));
        }
    }
    if (this.state.revision !== 1)
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.revision", "must be 1 in a root contract"));

    else if (!this.state.createdAt.equals(this.definition.createdAt))
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.created_at", "should match definition.create_at in a root contract"));

    if (this.state.origin != null)
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.origin", "must be empty in a root contract"));

    if (this.state.parent != null)
        this.errors.push(new ErrorRecord(Errors.BAD_VALUE, prefix+"state.parent", "must be empty in a root contract"));

    this.checkRevokePermissions(this.revokingItems);
};

Contract.prototype.checkRevokePermissions = function(revokes) {
    for (let rc of revokes) {

        //check if revoking parent => no permission is needed
        if(this.state.parent != null && rc.id.equals(this.state.parent))
            continue;

        let permissions = rc.definition.permissions.get("revoke");
        let found = false;
        if(permissions != null) {
            for(let p of permissions) {
                this.quantiser.addWorkCost(QuantiserProcesses.PRICE_APPLICABLE_PERM);
                if(p.isAllowedForKeys(new Set(this.effectiveKeys.keys()))) {
                    found = true;
                    break;
                }
            }
        }

        if (!found)
            this.errors.push(new ErrorRecord(Errors.FORBIDDEN, "revokingItem", "revocation not permitted for item " + rc.id.base64.substring(0,6) + "..."));
    }
};

Contract.prototype.checkChangedContract = function() {
    this.updateContext();
    let parent;
    // if exist siblings for contract (more then itself)
    if(this.context.siblings.size > 1) {
        parent = this.context.base;
    } else {
        parent = this.getRevokingItem(this.state.parent);
    }

    if (parent == null) {
        this.errors.push(new ErrorRecord(Errors.BAD_REF, "parent", "parent contract must be included"));
    } else {
        // checking parent:
        // proper origin

        if (!parent.getOrigin().equals(this.state.origin)) {
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "state.origin", "wrong origin, should be root"));
        }
        if (!parent.id.equals(this.state.parent))
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "state.parent", "illegal parent reference"));

        let delta = new ContractDelta(parent, this);
        delta.check();

        this.checkRevokePermissions(delta.revokingItems);
    }
};

Contract.prototype.getOrigin = function() {
    if(this.state.origin == null) {
        return this.id;
    } else {
        return this.state.origin;
    }
};

Contract.prototype.getReferencedItems = function() {

    let referencedItems = new Set();

    if (this.transactional != null)
        for (let constr of this.transactional.constraints)
            for (let matching of constr.matchingItems)
                referencedItems.add(matching);

    if (this.definition != null)
        for (let constr of this.definition.constraints)
            for (let matching of constr.matchingItems)
                referencedItems.add(matching);

    if (this.state != null)
        for (let constr of this.state.constraints)
            for (let matching of constr.matchingItems)
                referencedItems.add(matching);

    return referencedItems;
};

/**
 * Add constraint to the constraints list of the contract
 * @param {Constraint} constr - constraint to add
 */
Contract.prototype.addConstraint = function(c) {

    if (c.type === constr.Constraint.TYPE_TRANSACTIONAL) {
        if (this.transactional != null)
            this.transactional.addConstraint(c);
    } else if (c.type === constr.Constraint.TYPE_EXISTING_DEFINITION)
        this.definition.addConstraint(c);
    else if(c.type === constr.Constraint.TYPE_EXISTING_STATE)
        this.state.addConstraint(c);

    this.constraints.set(c.name, c);
};

/**
 * Remove constraint to the constraints list of the contract
 * @param removed constraint to remove
 */
Contract.prototype.removeReferencedItem = function(removed) {

    for (let constr of this.constraints)
        constr.matchingItems.delete(removed);

    if (this.transactional != null)
        for (let constr of this.transactional.constraints)
            constr.matchingItems.delete(removed);

    if (this.definition != null)
        for (let constr of this.definition.constraints)
            constr.matchingItems.delete(removed);

    if (this.state != null)
        for (let constr of this.state.constraints)
            constr.matchingItems.delete(removed);

    this.newItems.delete(removed);
    this.revokingItems.delete(removed);
};

Contract.prototype.checkConstraints = function(contractsTree, roleConstraintsOnly) {

    if (typeof roleConstraintsOnly === "undefined")
        roleConstraintsOnly = false;

    this.validRoleConstraints.clear();

    if (this.constraints.size === 0)
        return true;        // if contract has no constraints -> then it's checkConstraints check is ok

    let neighbours = contractsTree.values();

    // check each constraint, all must be ok
    let allRefs_check = true;
    for (let c of this.constraints.values()) {

        let roleConstraint = false;
        for (let roleName in this.roles)
            if (this.roles.hasOwnProperty(roleName) && this.roles[roleName] instanceof roles.Role &&
                this.roles[roleName].containConstraint(c.name)) {
                roleConstraint = true;
                break;
            }

        if (!roleConstraint)
            for (let plist of this.definition.permissions.values()) {
                for (let perm of plist)
                    if (perm.role.containConstraint(c.name)) {
                        roleConstraint = true;
                        break;
                    }

                if (roleConstraint)
                    break;
            }

        if (roleConstraintsOnly && !roleConstraint)
            continue;

        // use all neighbourContracts to check constraint. at least one must be ok
        let c_check = false;
        if (c.type === constr.Constraint.TYPE_TRANSACTIONAL) {
            for (let neighbour of neighbours)
                if ((((c.transactional_id != null && neighbour.transactional != null && c.transactional_id.equals(neighbour.transactional.id)) ||
                    (c.contract_id != null && c.contract_id.equals(neighbour.id))) && this.checkOneConstraint(c, neighbour)) ||
                    (c.conditions.length > 0))    // new format of constraint with conditions, transactional_id - optional
                    if (c.isMatchingWith(neighbour, neighbours)) {
                        c.addMatchingItem(neighbour);
                        c_check = true;
                        break;
                    }

        } else if ((c.type === constr.Constraint.TYPE_EXISTING_DEFINITION) || (c.type === constr.Constraint.TYPE_EXISTING_STATE)) {
            for (let neighbour of neighbours)
                if (c.isMatchingWith(neighbour, neighbours))
                    c.addMatchingItem(neighbour);

            c_check = c.isValid();
        }

        if (!c_check) {
            if (!roleConstraint) {
                allRefs_check = false;
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "checkConstraints return false"));
            }
        } else {
            if(roleConstraint)
                this.validRoleConstraints.add(c.name);
        }
    }

    return allRefs_check;
};

Contract.prototype.checkOneConstraint = function(c, refContract) {
    let res = true;

    if (c.type === constr.Constraint.TYPE_TRANSACTIONAL) {
        if ((c.transactional_id == null) ||
            (refContract.transactional == null) ||
            (refContract.transactional.id == null) ||
            (c.transactional_id === "") ||
            (refContract.transactional.id === "")) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "transactional is missing"));
        } else {
            if (c.transactional_id != null && refContract.transactional == null) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "transactional not found"));
            } else if (c.transactional_id !== refContract.transactional.id) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "transactional_id mismatch"));
            }
        }
    }

    if (c.contract_id != null) {
        if (!c.contract_id.equals(refContract.id)) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "contract_id mismatch"));
        }
    }

    if (c.origin != null) {
        if (!c.origin.equals(refContract.getOrigin())) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "origin mismatch"));
        }
    }

    for (let refRole of c.signed_by) {
        if (!refContract.isSignedBy(refRole)) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_SIGNATURE, "contract (hashId=" + this.id.base64.substring(0, 8) + "…)", "fingerprint mismatch"));
        }
    }

    return res;
};

Contract.prototype.isSignedBy = function(role) {
    if (role == null)
        return false;

    if (role instanceof roles.RoleLink)
        role  = role.resolve();

    if (role == null)
        return false;

    return role.isAllowedForKeys(this.effectiveKeys.keys());
};

Contract.prototype.setEffectiveKeys = function(additionalSignatures) {
    //TODO: if we want to filter by creator keys -> do it here. it is the best place
    this.effectiveKeys = new t.GenericMap();
    for(let [k,v] of this.sealedByKeys) {
        this.effectiveKeys.set(k,v);
    }

    if(additionalSignatures != null) {
        for(let [k,v] of additionalSignatures) {
            this.effectiveKeys.set(k,v);
        }
    }
    this.newItems.forEach(c => c.setEffectiveKeys(this.effectiveKeys));
};

Contract.prototype.verifySignatures = async function() {
    await this.verifySealedKeys();
    for(let ni of this.newItems) {
        ni.quantiser.reset(this.quantiser.quantasLeft())
        await ni.verifySignatures();
        this.quantiser.addWorkCostFrom(ni.quantiser);
    }

    for(let ri of this.revokingItems) {
        ri.quantiser.reset(this.quantiser.quantasLeft())
        await ri.verifySealedKeys();
        this.quantiser.addWorkCostFrom(ri.quantiser);
    }
};

Contract.prototype.verifySealedKeys = async function(isQuantise) {
    if(typeof isQuantise === "undefined")
        isQuantise = true;

    if (this.sealedBinary == null)
        return;

    if (!this.isNeedVerifySealedKeys) {
        if (isQuantise) {
            for(let key of this.sealedByKeys.keys()) {
                this.quantiser.addWorkCost(key.bitStrength === 2048 ? QuantiserProcesses.PRICE_CHECK_2048_SIG : QuantiserProcesses.PRICE_CHECK_4096_SIG);
            }
        }
        return;
    }

    let data = Boss.load(this.sealedBinary);
    if (data.type !== "unicapsule")
        throw "wrong object type, unicapsule required";


    let contractBytes = data.data;

    let keys = new t.GenericMap();


    for(let roleName of Object.keys(this.roles)) {
        roles.RoleExtractor.extractKeys(this.roles[roleName]).forEach(key=>keys.set(key.fingerprints,key));
        roles.RoleExtractor.extractAddresses(this.roles[roleName]).forEach(ka=>{
            for(let key of this.transactionPack.keysForPack) {
                if(ka.match(key)) {
                    keys.set(key.fingerprints, key);
                    break;
                }
            }
        });
    }

    // verify signatures
    for (let signature of  data.signatures) {

        let key = ExtendedSignature.extractPublicKey(signature);
        if (key == null) {
            let keyId = ExtendedSignature.extractKeyId(signature);
            key = keys.get(keyId);
        }

        if (key != null) {
            if (isQuantise)
                this.quantiser.addWorkCost(key.bitStrength === 2048 ? QuantiserProcesses.PRICE_CHECK_2048_SIG : QuantiserProcesses.PRICE_CHECK_4096_SIG);

            let es = await ExtendedSignature.verify(key, signature, contractBytes);
            if (es != null) {
                this.sealedByKeys.set(key, es);
            } else
                this.errors.push(new ErrorRecord(Errors.BAD_SIGNATURE, "keytag:" + key, "the signature is broken"));
        }
    }

    this.isNeedVerifySealedKeys = false;
};

Contract.prototype.copy = function() {
    let bbm = BossBiMapper.getInstance();

    return bbm.deserialize(bbm.serialize(this));

};
Contract.prototype.createRevision = function(keys) {
    let newRevision = this.copy();

    newRevision.state.revision = this.state.revision + 1;
    newRevision.state.createdAt = new Date();
    newRevision.state.parent = this.id;
    newRevision.state.origin = this.state.revision === 1 ? this.id : this.state.origin;
    newRevision.revokingItems.add(this);
    newRevision.transactional = null;

    if (newRevision.definition != null && newRevision.definition.constraints != null) {
        for(let constr of newRevision.definition.constraints) {
            constr.setContract(newRevision);
            newRevision.constraints.set(constr.name, constr);
        }
    }
    if (newRevision.state != null && newRevision.state.constraints != null) {
        for(let constr of newRevision.state.constraints) {
            constr.setContract(newRevision);
            newRevision.constraints.set(constr.name, constr);
        }
    }

    if(keys) {
        let addresses = new Set();
        for(let k of keys) {
            addresses.add(k.publicKey.longAddress);
            newRevision.keysToSignWith.add(k);
        }
        let creator = new roles.SimpleRole("creator",addresses);
        newRevision.registerRole(creator);
    }

    return newRevision;
};


Contract.prototype.split = function(count) {
    // we can split only the new revision and only once this time
    if (this.state.getBranchRevision() === this.state.revision)
        throw "this revision is already split";
    if (count < 1)
        throw "split: count should be > 0";

    // initialize context if not yet
    this.updateContext();

    this.state.setBranchNumber(0);
    let results = [];
    for (let i = 0; i < count; i++) {
        // we can't create revision as this is already a new revision, so we copy self:
        let c = this.copy();
        // keys are not COPIED by default
        this.keysToSignWith.forEach(k => c.keysToSignWith.add(k));
        // save branch information
        c.state.setBranchNumber(i + 1);
        // and it should refer the same parent to and set of siblings
        c.context = this.context;
        this.context.siblings.add(c);
        this.newItems.add(c);
        results.push(c);
    }
    return results;
};

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UniversaContract",Contract));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Contract};