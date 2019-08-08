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
const Constraint = require('constraint').Constraint;
const permissions = require('permissions');
const e = require("errors");
const Errors = e.Errors;
const ErrorRecord = e.ErrorRecord;
const Config = require("config").Config;
const ContractDelta = require("contractdelta").ContractDelta;
const ExtendedSignature = require("extendedsignature").ExtendedSignature;
const ex = require("exceptions");
const yaml = require('yaml');
const BigDecimal  = require("big").Big;

const MAX_API_LEVEL = 4;

function Context(base) {
    this.base = base;
    this.siblings = new t.GenericSet();
}

class Transactional extends bs.BiSerializable {
    /**
     * Transactional is one of contract sections. It can be changed or even skipped freely across contract revisions
     *
     * @param contract {Contract} transactional is created for
     * @constructor
     */
    constructor(contract) {
        super();
        this.contract = contract;
        this.id = null;
        this.constraints = new t.GenericSet();
        this.validUntil = null;
        this.data = {};
    }

    async serialize(serializer) {

        let of = {
            id: this.id,
            constraints : await serializer.serialize(this.constraints),
            data : this.data,
        };

        if (this.validUntil != null)
            of.valid_until = this.validUntil;

        return await serializer.serialize(of);
    }

    async deserialize(data, deserializer) {
        if(data != null) {
            this.id = data.id;

            if (data.hasOwnProperty("constraints"))
                this.constraints = new t.GenericSet(await deserializer.deserialize(data.constraints));
            else if (data.hasOwnProperty("references"))
                this.constraints = new t.GenericSet(await deserializer.deserialize(data.references));
            else
                this.constraints = new t.GenericSet();

            if (data.hasOwnProperty("valid_until"))
                this.validUntil = data.valid_until;

            this.data = data.data;
        }
    }
}


class State extends bs.BiSerializable {
    /**
     * State is one of contract sections. It can be changed across contract revisions however changes
     * are made strictly according to either global or permission-controlled rules
     *
     * @param contract {Contract} state is created for
     * @constructor
     */
    constructor(contract) {
        super();
        this.contract = contract;
        this.revision = 1;
        if(contract.definition) {
            this.createdAt = new Date(contract.definition.createdAt);
        } else {
            this.createdAt = null;
        }
        this.expiresAt = null;
        this.origin = null;
        this.parent = null;
        this.data = {};
        this.branchId = null;
        this.constraints = new t.GenericSet();

        //TODO:setJS
    }

    equals(to) {
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

        return t.valuesEqual(this.constraints,to.constraints);;
    }

    getBranchRevision() {
        if (this.branchId == null)
            return 0;
        else
            return parseInt(this.branchId.split(":")[0])
    }

    setBranchNumber(number) {
        this.branchId = this.revision + ":" + number;
    }

    async serialize(serializer) {
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
            of.constraints = await serializer.serialize(this.constraints);

        return await serializer.serialize(of);
    }

    async deserialize(data, deserializer) {
        this.createdAt = await deserializer.deserialize(data.created_at);
        if(data.hasOwnProperty("expires_at"))
            this.expiresAt = await deserializer.deserialize(data.expires_at);
        else
            this.expiresAt = null;

        this.revision = data.revision;
        if (this.revision <= 0)
            throw new ex.IllegalArgumentError("illegal revision number: " + this.revision);

        if (data.hasOwnProperty("constraints"))
            this.constraints = new t.GenericSet(await deserializer.deserialize(data.constraints));
        else if (data.hasOwnProperty("references"))
            this.constraints = new t.GenericSet(await deserializer.deserialize(data.references));
        else
            this.constraints = new t.GenericSet();

        let r = this.contract.registerRole(await deserializer.deserialize(data.owner))
        if(r.name !== "owner")
            throw new ex.IllegalArgumentError("bad owner role name");

        r = this.contract.registerRole(await deserializer.deserialize(data.created_by))
        if(r.name !== "creator")
            throw new ex.IllegalArgumentError("bad creator role name");

        if(data.hasOwnProperty("data"))
            this.data = data.data;
        else
            this.data = {};


        if(data.hasOwnProperty("branch_id"))
            this.branchId = data.branch_id;
        else
            this.branchId = {};


        if(data.hasOwnProperty("parent") && data.parent != null)
            this.parent = await deserializer.deserialize(data.parent);
        else
            this.parent = null;


        if(data.hasOwnProperty("origin") && data.origin != null)
            this.origin = await deserializer.deserialize(data.origin);
        else
            this.origin = null;
    }

    initializeWithDsl(root) {
        this.createdAt = t.convertToDate(root.created_at);
        this.expiresAt = t.convertToDate(root.expires_at);

        if (root.revision != null)
            this.revision = root.revision;
        else
            throw new ex.IllegalArgumentError("state.revision not found");

        if (root.data != null)
            this.data = root.data;
        else
            this.data = {};

        if (this.createdAt == null) {
            if (this.revision !== 1)
                throw new ex.IllegalArgumentError("state.created_at must be set for revisions > 1");

            this.createdAt = new Date(this.contract.definition.createdAt);
        }

        this.contract.createRole("owner", root.owner);
        this.contract.createRole("creator", root.created_by);

        let constrs = null;
        if (root.constraints != null)
            constrs = root.constraints;
        if (root.references != null)
            constrs = root.references;

        if (constrs != null)
            constrs.forEach(item => {
                let constraint;
                if (item.hasOwnProperty("constraint"))
                    constraint = item.constraint;
                if (item.hasOwnProperty("reference"))
                    constraint = item.reference;

                if (constraint != null)
                    this.constraints.add(Constraint.fromDsl(constraint, this.contract));
                else
                    throw new ex.IllegalArgumentError("Expected constraint section");
            });

        return this;
    }
}


class Definition extends bs.BiSerializable {
    /**
     * Definition is one of contract sections. It is immutable and can not be changed across contract revisions
     *
     * @param contract {Contract} definition is created for
     * @constructor
     */
    constructor(contract) {
        super();
        this.contract = contract;
        this.createdAt = new Date();
        this.createdAt.setMilliseconds(0);
        this.expiresAt = null;
        this.data = {};
        this.constraints = new t.GenericSet();
        this.extendedType = null;
        this.permissions = new Map();

        //TODO:setJS
    }

    equals(to) {
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

        return t.valuesEqual(this.constraints,to.constraints);
    }

    async serialize(serializer) {

        let pb = {};
        for (let plist of this.permissions.values()) {
            for (let perm of plist) {
                if (perm.id == null)
                    throw new ex.IllegalArgumentError("permission without id: " + perm);
                if (pb.hasOwnProperty(perm.id))
                    throw new ex.IllegalArgumentError("permission: duplicate permission id found: " + perm);
                pb[perm.id] = await serializer.serialize(perm);
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
            of.constraints = await serializer.serialize(this.constraints);

        if (this.extendedType != null)
            of.extended_type = this.extendedType;

        return await serializer.serialize(of);
    }

    async deserialize(data, deserializer) {
        let r = this.contract.registerRole(await deserializer.deserialize(data.issuer));
        if(r.name !== "issuer")
            throw new ex.IllegalArgumentError("issuer creator role name");

        this.createdAt = await deserializer.deserialize(data.created_at);
        if(data.hasOwnProperty("expires_at")) {
            this.expiresAt = await deserializer.deserialize(data.expires_at);
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
            this.constraints = new t.GenericSet(await deserializer.deserialize(data.constraints));
        else if (data.hasOwnProperty("references"))
            this.constraints = new t.GenericSet(await deserializer.deserialize(data.references));
        else
            this.constraints = new t.GenericSet();

        let perms = await deserializer.deserialize(data.permissions);
        for(let pid of Object.keys(perms)) {
            perms[pid].id = pid;
            this.addPermission(perms[pid]);
        }
    }

    addPermission(permission) {
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
    }

    initializeWithDsl(root) {
        this.contract.createRole("issuer", root.issuer);

        this.createdAt = t.convertToDate(root.created_at);
        this.expiresAt = t.convertToDate(root.expires_at);

        if (root.data != null)
            this.data = root.data;
        else
            this.data = {};

        if (root.hasOwnProperty("extended_type"))
            this.extendedType = root.extended_type;

        let constrs = null;
        if (root.constraints != null)
            constrs = root.constraints;
        if (root.references != null)
            constrs = root.references;

        if (constrs != null)
            constrs.forEach(item => {
                let constraint;
                if (item.hasOwnProperty("constraint"))
                    constraint = item.constraint;
                if (item.hasOwnProperty("reference"))
                    constraint = item.reference;

                if (constraint != null)
                    this.constraints.add(Constraint.fromDsl(constraint, this.contract));
                else
                    throw new ex.IllegalArgumentError("Expected constraint section");
            });

        return this;
    }

    /**
     * Collect all permissions and create links to roles or new roles as appropriate
     */
    scanDslPermissions(root) {
        if (root.hasOwnProperty("permissions"))
            for (let [name, params] of Object.entries(root.permissions)) {
                // this complex logic is needed to process both yaml-imported structures
                // and regular serialized data in the same place
                let proto = Object.getPrototypeOf(params);
                if (proto === Array.prototype || proto === Set.prototype || proto === t.GenericSet.prototype)
                    for (let param of params)
                        this.loadDslPermission(name, param);
                else if (params instanceof permissions.Permission)
                    this.addPermission(params);
                else
                    this.loadDslPermission(name, params);
            }
    }

    loadDslPermission(name, params) {
        let roleName = null;
        let role = null;

        let stringParams = (typeof params === "string");
        if (stringParams)
        // yaml style: permission: role
            roleName = params;
        else {
            // extended yaml style or serialized object
            if (!params.hasOwnProperty("role"))
                throw new ex.IllegalArgumentError("Expected role of permission");

            let x = params.role;
            if (x instanceof roles.Role)
            // serialized, role object
                role = this.contract.registerRole(x);
            else if (Object.getPrototypeOf(x) === Object.prototype)
            // if Object - create role from Object
                role = this.contract.createRole("@" + name, x);
            else
            // yaml, extended form: permission: { role: name, ... }
                roleName = x;
        }

        if (role == null && roleName != null)
        // we need to create alias to existing role
            role = this.contract.createRole("@" + name, roleName);

        if (role == null)
            throw new ex.IllegalArgumentError("permission " + name + " refers to missing role: " + roleName);

        // now we have ready role and probably parameter for custom rights creation
        this.addPermission(permissions.Permission.forName(name, role, stringParams ? null : params));
    }
}


class Contract extends bs.BiSerializable {
    /**
     * Universa contract
     * @constructor
     */
    constructor() {
        super();
        this.revokingItems = new t.GenericSet();
        this.newItems = new t.GenericSet();
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
        this.keysToSignWith = new t.GenericSet();
        this.constraints = new Map();
        this.id = null;
        this.transactionPack = null;
        this.validRoleConstraints = new Set();
        this.quantiser = new Quantiser();
    }

    async setOwnBinary(result) {
        let tpBackup = null;
        if(this.transactionPack != null && this.transactionPack.contract === this) {
            tpBackup = this.transactionPack;
        }

        if(result.signatures.length === 0) {
            result.salt = t.randomBytes(12);
        } else {
            delete  result.salt;
        }
        this.sealedBinary = await Boss.dump(result);
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

    updateContext() {
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
    }

    /**
     * Get contract constraint with given name.
     *
     * @param {string} name - Name of the constraint.
     * @return {Constraint | null} found constraint or null.
     */
    findConstraintByName(name) {
        return this.constraints.get(name);
    }

    /**
     * Get contract constraint with given name in given section.
     *
     * @param {string} name - Name of the constraint.
     * @param {string} section - Section to search in.
     * @return {Constraint | null} found constraint or null.
     */
    findConstraintByNameInSection(name, section) {
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
    }

    /**
     * Get the named field in 'dotted' notation, e.g. 'state.data.name', or 'state.origin', 'definition.issuer' and so
     * on.
     *
     * @param name of field to got value from
     * @returns found value
     */
    get(name) {
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
                case "origin":
                    return this.getOrigin();
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
                    return this.getOrigin();
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
                return this.getOrigin();
            case "issuer":
                return this.roles.issuer;
            case "owner":
                return this.roles.owner;
            case "creator":
                return this.roles.creator;
        }
        throw new ex.IllegalArgumentError("bad root: " + originalName);

    }

    /**
     * Seal contract to binary.
     * This call adds signatures from {@link #Contract.keysToSignWith}
     *
     * @param isTransactionRoot indicates if contract is transaction root and  transaction pack should be created
     * @return contract's sealed unicapsule
     */
    async seal(isTransactionRoot = false) {

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

        let forPack = await BossBiMapper.getInstance().serialize(
            {
                "contract" : this,
                "revoking" : revokingIds,
                "new" : newIds
            }
        );

        let contractBytes = await Boss.dump(forPack);

        let signatures = [];
        let result = {
            type: "unicapsule",
            version: 3,
            data: contractBytes,
            signatures: signatures
        };
        await this.setOwnBinary(result);

        await this.addSignatureToSeal(this.keysToSignWith);

        if (isTransactionRoot)
            this.transactionPack = new TransactionPack(this);

        return this.sealedBinary;
    }

    sealV2() {
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

    async serialize(serializer) {
        let binder = {
            api_level: this.apiLevel,
            definition : await this.definition.serialize(serializer),
            state : await this.state.serialize(serializer)
        };


        if (this.transactional != null)
            binder.transactional = await this.transactional.serialize(serializer);

        //    console.log(JSON.stringify(binder));

        return binder;
    }

    async deserialize(data, deserializer) {
        //console.log(JSON.stringify(data));

        let l = data.api_level;
        if (l > MAX_API_LEVEL)
            throw new ex.IllegalArgumentError("contract api level conflict: found " + l + " my level " + this.apiLevel);

        if (this.definition == null)
            this.definition = new Definition(this);
        await this.definition.deserialize(data.definition, deserializer);

        await this.state.deserialize(data.state, deserializer);

        if (data.hasOwnProperty("transactional")) {
            if (this.transactional == null)
                this.transactional = new Transactional();
            await this.transactional.deserialize(data.transactional, deserializer);
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
    }

    /**
     * Register new role for contract. If role with the same name already exists it will be replaced with new one
     *
     *
     * @param role {Role} to register
     * @returns {Role}
     */
    registerRole(role) {
        this.roles[role.name] = role;
        role.contract = this;
        return role;
    }

    getRevokingItem(id) {
        for(let ri of this.revokingItems) {
            if(t.valuesEqual(ri.id,id)) {
                return ri;
            }
        }

        return null;
    }

    /**
     * Asynchronously adds signature to sealed binary of contract. Keeps contract data as it is it however changes its id.
     *
     * Useful if you got contracts from third-party and need to sign it.
     * F.e. contracts that should be sign with two persons.
     *
     * @param {Array<crypto.PrivateKey>|Set<crypto.PrivateKey>|crypto.PrivateKey} x - Keys to sign contract with
     */
    async addSignatureToSeal(x) {
        let keys;
        let proto = Object.getPrototypeOf(x);
        if(proto === Array.prototype || proto === Set.prototype  || proto === t.GenericSet.prototype) {
            keys = x;
        } else if(proto === crypto.PrivateKey.prototype){
            keys = [];
            keys.push(x);
        } else {
            throw new ex.IllegalArgumentError("Invalid param " + x + ". Should be either PrivateKey or Array of PrivateKey");
        }

        if(this.sealedBinary == null)
            throw new ex.IllegalStateError("failed to add signature: sealed binary does not exist");

        keys.forEach(k => this.keysToSignWith.add(k));

        let data = Boss.load(this.sealedBinary);
        let contractBytes = data.data;
        for (let key of keys) {
            let signature = await ExtendedSignature.sign(key, contractBytes);
            await this.addSignatureBytesToSeal(signature,key.publicKey);
        }
    }

    /**
     * Asynchronously adds pre-constructed signature to sealed binary of contract. Keeps contract data as it is it however changes its id.
     *
     * Useful if signature was constructed by third-party and needs to be added to contract.
     *
     * @param signature - pre-constructed signature bytes
     * @param publicKey - key that corresponds to signature
     */
    async addSignatureBytesToSeal(signature,publicKey) {
        if(this.sealedBinary == null)
            throw new ex.IllegalArgumentError("failed to add signature: sealed binary does not exist");

        let data = Boss.load(this.sealedBinary);
        //console.log(Object.getPrototypeOf(data.signatures).constructor.name);
        data.signatures.push(signature);

        let contractBytes = data.data;
        let  es = await ExtendedSignature.verify(publicKey, signature, contractBytes);
        if (es != null) {
            this.sealedByKeys.set(publicKey, es);
        }

        await this.setOwnBinary(data);
    }

    equals(to) {
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
    }

    toString() {
        return crypto.HashId.of(t.randomBytes(64));
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }

    /**
     * Asynchronously checks contract filling the {@link Contract.errors}. Call it without params on root contract of transaction
     *
     * @param {string} prefix - used for subsequent checks of children contracts
     * @param {GenericMap} contractsTree - used for subsequent checks of children contracts
     * @returns {Promise<boolean>} indicating if check was successful
     */
    async check(prefix = "", contractsTree = null) {
        this.errors = [];

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
                await this.checkChangedContract();

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
            await this.checkSubItemQuantized(c, p, contractsTree);
            c.errors.forEach(e => this.errors.push(e));
            index++;
        }

        if(prefix === "")
            this.checkDupesCreation(contractsTree);

        this.checkTestPaymentLimitations();

        return this.errors.length === 0;
    }

    getRevisionId() {
        let parentId = this.state.parent == null ? "" : this.state.parent.base64 + "/";
        let originId = this.state.origin == null ? this.id.base64 : this.state.origin.base64;
        let branchId = this.state.branchId == null ? "" : "/" + this.state.branchId;
        return originId + parentId + this.state.revision + branchId;
    }

    checkDupesCreation(contractsTree) {
        let revisionIds = new Set();
        for (let c of contractsTree.values()) {
            let cid = c.getRevisionId();
            if (revisionIds.has(cid)) {
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "duplicated revision id: " + cid));
            } else
                revisionIds.add(cid);
        }
    }

    checkTestPaymentLimitations() {
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
            expirationLimit.setDate(expirationLimit.getDate() + Config.maxExpirationDaysInTestMode);

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
    }

    /**
     * Check contract to be a valid "U" payment. This includes standard contract check and additional payment related checks.
     *
     * @param {Array<crypto.KeyAddress>} issuerKeys - Addresses of keys used by the network to issue "U".
     * @throws Quantiser.QuantiserException when quantas limit was reached during check.
     * @return if check was successful.
     */
    async paymentCheck(issuerKeys) {
        let res = true;

        // Checks that there is a payment contract and the payment should be >= 1
        let u = t.getOrDefault(this.state.data, "transaction_units", -1);
        let test_u = t.getOrDefault(this.state.data, "test_transaction_units", -1);
        if (u === -1) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "u < 0"));
        }

        // check valid name/type fields combination
        if (u == null || typeof u !== "number") {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "u name/type mismatch"));
        }

        if (test_u !== -1) {
            if (test_u == null || typeof test_u !== "number") {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "test_u name/type mismatch"));
            }

            if (test_u < 0) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "test_u < 0"));
            }

            if (this.state.origin != null) {
                this.updateContext();
                let parent;
                // if exist siblings for contract (more then itself)
                if (this.context.siblings.size > 1)
                    parent = this.context.base;
                else
                    parent = this.getRevokingItem(this.state.parent);

                let was_u = t.getOrDefault(parent.state.data, "transaction_units", -1);
                let was_test_u = t.getOrDefault(parent.state.data, "test_transaction_units", -1);

                if (u !== was_u && test_u !== was_test_u) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "u and test_u can not be spent both"));
                }
            } else if (this.limitedForTestnet) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "",
                    "Payment contract has not origin but it is not allowed for parcel. Use standalone register for payment contract."));
            }
        } else if(this.limitedForTestnet) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "Payment contract that marked as for testnet has not test_u."));
        }

        await this.verifySealedKeys(false);

        // check valid decrement_permission
        if (!this.isPermitted("decrement_permission", this.sealedByKeys.keys())) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "decrement_permission is missing"));
        }

        // The "U" contract is checked to have valid issuer key (one of preset URS keys)
        if (!this.roles.issuer instanceof roles.SimpleRole) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "issuer is not valid. must be simple role"));
        } else {
            let thisIssuerAddresses = new t.GenericSet(this.roles.issuer.keyAddresses);
            Array.from(this.roles.issuer.keyRecords.keys()).forEach(pk => thisIssuerAddresses.add(pk.shortAddress));

            if (!issuerKeys.some(k => thisIssuerAddresses.has(k))) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "issuerKeys is not valid"));
            }
        }

        // If the check is failed, checking process is aborting
        if (!res)
            return res;

        // The U shouldn't have any new items
        if (this.newItems.size > 0) {
            res = false;
            this.errors.push(new ErrorRecord(Errors.BAD_NEW_ITEM, "", "payment contract can not have any new items"));
        }

        // If the check is failed, checking process is aborting
        if (!res)
            return res;

        // check if payment contract not origin itself, means has revision more then 1
        // don't make this check for initial u contract
        if (this.state.revision !== 1 || this.state.parent != null) {
            if (this.getOrigin().equals(this.id)) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "can't origin itself"));
            }

            if (this.state.revision <= 1) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_VALUE, "", "revision must be greater than 1"));
            }

            // The "U" is checked for its parent validness, it should be in the revoking items
            if (this.revokingItems.size !== 1) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REVOKE, "", "revokingItems.size != 1"));
            } else {
                let revoking = Array.from(this.revokingItems)[0];
                if (!revoking.getOrigin().equals(this.getOrigin())) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.BAD_REVOKE, "", "origin mismatch"));
                }
            }
        }

        if (res)
            res = await this.check();

        return res;
    }

    /**
     * Calculates transaction processing cost in U
     * @returns {number} - transaction processing const in U
     */
    getProcessedCostU() {
        return Math.ceil( this.quantiser.quantaSum_ / Quantiser.quantaPerU);
    }


    /**
     * Get contract creation time
     * @return {Date} contract creation time
     */
    getCreatedAt() {
        return this.state.origin != null ? this.state.createdAt : this.definition.createdAt;
    }

    /**
     * Get contract expiration time
     * @returns {Date} contract expiration time
     */
    getExpiresAt() {
        return this.state.expiresAt != null ? this.state.expiresAt : this.definition.expiresAt;
    }

    /**
     * Quantize given permission (add cost for that permission).
     * Use for permissions that will be applicated, but before checking.
     *
     * @param {Permission} permission - Permission that will be quantized
     * @throws Quantiser.QuantiserException if processing cost limit is got
     */
    checkApplicablePermissionQuantized(permission) {
        // Add check an applicable permission quanta
        this.quantiser.addWorkCost(Quantiser.QuantiserProcesses.PRICE_APPLICABLE_PERM);

        // Add check a splitjoin permission	in addition to the permission check quanta
        if (permission instanceof permissions.SplitJoinPermission)
            this.quantiser.addWorkCost(Quantiser.QuantiserProcesses.PRICE_SPLITJOIN_PERM);
    }

    async checkSubItemQuantized(subitem, prefix, neighbourContracts) {
        // Add checks from subItem quanta
        subitem.quantiser.reset(this.quantiser.quantasLeft());
        await subitem.check(prefix, neighbourContracts);
        this.quantiser.addWorkCostFrom(subitem.quantiser);
    }

    /**
     * Checks if permission of given type that is allowed for given keys exists.
     * Optionally, quantise permissions checking.
     *
     * @param {string} permissionName - Type of permission to check for.
     * @param {Iterable<crypto.PublicKey> | Iterable<crypto.PrivateKey>} keys - Collection of keys to check with.
     * @param {boolean} quantise - Quantise permissions checking. Optional. False by default.
     * @return {boolean} permission allowed for keys is found.
     * @throws Quantiser.QuantiserException if quantas limit was reached during check (if quantise is true).
     */
    isPermitted(permissionName, keys, quantise = false) {
        let cp = this.definition.permissions.get(permissionName);
        if (cp != null)
            for (let p of cp)
                if (p.isAllowedForKeys(keys)) {
                if (quantise)
                    this.checkApplicablePermissionQuantized(p);

                return true;
            }

        return false;
    }

    basicCheck(prefix) {
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
        else if (!this.roles.creator.isAllowedForKeys(new t.GenericSet(this.effectiveKeys.keys())))
            this.errors.push(new ErrorRecord(Errors.NOT_SIGNED, prefix, "missing creator signature(s)"));
    }

    checkRootContract(prefix) {
        //issuer presence and validity is already checked within basicCheck
        if(this.roles.issuer != null && this.roles.issuer.isValid()) {
            if (!this.roles.issuer.isAllowedForKeys(new t.GenericSet(this.effectiveKeys.keys()))) {
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
    }

    checkRevokePermissions(revokes) {
        for (let rc of revokes) {

            //check if revoking parent => no permission is needed
            if(this.state.parent != null && rc.id.equals(this.state.parent))
                continue;

            let permissions = rc.definition.permissions.get("revoke");
            let found = false;
            if(permissions != null) {
                for(let p of permissions) {
                    this.quantiser.addWorkCost(QuantiserProcesses.PRICE_APPLICABLE_PERM);
                    if(p.isAllowedForKeys(new t.GenericSet(this.effectiveKeys.keys()))) {
                        found = true;
                        break;
                    }
                }
            }

            if (!found)
                this.errors.push(new ErrorRecord(Errors.FORBIDDEN, "revokingItem", "revocation not permitted for item " + rc.id.base64.substring(0,6) + "..."));
        }
    }

    async checkChangedContract() {
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
            await delta.check();

            this.checkRevokePermissions(delta.revokingItems);
        }
    }

    /**
     * Get contract origin
     * @returns {HashId} contract origin
     */
    getOrigin() {
        if(this.state.origin == null) {
            return this.id;
        } else {
            return this.state.origin;
        }
    }

    /**
     * Collects references items across the contract.
     *
     * @returns {Set<Contract>} references items.
     */
    getReferencedItems() {

        let referencedItems = new t.GenericSet();

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
    }

    /**
     * Add constraint to the constraints list of the contract.
     *
     * @param {Constraint} c - Constraint to add.
     */
    addConstraint(c) {
        if (c.type === Constraint.TYPE_TRANSACTIONAL) {
            if (this.transactional != null)
                this.transactional.constraints.add(c);
        } else if (c.type === Constraint.TYPE_EXISTING_DEFINITION)
            this.definition.constraints.add(c);
        else if(c.type === Constraint.TYPE_EXISTING_STATE)
            this.state.constraints.add(c);

        this.constraints.set(c.name, c);
    }

    /**
     * Remove constraint from the constraints list of the contract.
     *
     * @param {Constraint} c - Constraint to remove.
     */
    removeConstraint(c) {
        c.matchingItems.forEach(mi => {
            if (mi instanceof Contract) {
                this.newItems.delete(mi);
                this.revokingItems.delete(mi);
            }
        });

        if (c.type === Constraint.TYPE_TRANSACTIONAL && this.transactional != null)
            this.transactional.constraints.delete(c);
        else if (c.type === Constraint.TYPE_EXISTING_DEFINITION)
            this.definition.constraints.delete(c);
        else if (c.type === Constraint.TYPE_EXISTING_STATE)
            this.state.constraints.delete(c);

        this.constraints.delete(c.name);
    }

    /**
     * Remove referenced contract from referenced (constraints matching), new and revoking items.
     *
     * @param {Contract} removed - referenced contract to remove.
     */
    removeReferencedItem(removed) {

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
    }

    checkConstraints(contractsTree, roleConstraintsOnly) {

        if (typeof roleConstraintsOnly === "undefined")
            roleConstraintsOnly = false;

        this.validRoleConstraints.clear();

        if (this.constraints.size === 0)
            return true;        // if contract has no constraints -> then it's checkConstraints check is ok

        let neighbours = new t.GenericSet(contractsTree.values());

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
            if (c.type === Constraint.TYPE_TRANSACTIONAL) {
                for (let neighbour of neighbours)
                    if ((((c.transactional_id != null && neighbour.transactional != null && neighbour.transactional.id != null &&
                        c.transactional_id.equals(neighbour.transactional.id)) ||
                        (c.contract_id != null && c.contract_id.equals(neighbour.id))) && this.checkOneConstraint(c, neighbour)) ||
                        (c.conditions.length > 0))    // new format of constraint with conditions, transactional_id - optional
                        if (c.isMatchingWith(neighbour, neighbours)) {
                            c.addMatchingItem(neighbour);
                            c_check = true;
                            break;
                        }

            } else if ((c.type === Constraint.TYPE_EXISTING_DEFINITION) || (c.type === Constraint.TYPE_EXISTING_STATE)) {
                for (let neighbour of neighbours)
                    if (c.isMatchingWith(neighbour, neighbours))
                        c.addMatchingItem(neighbour);

                c_check = c.isValid();
            }

            if (!c_check) {
                if (!roleConstraint) {
                    allRefs_check = false;
                    this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "contract (hashId=" + this.id + ")", "checkConstraints return false"));
                }
            } else {
                if(roleConstraint)
                    this.validRoleConstraints.add(c.name);
            }
        }

        return allRefs_check;
    }

    checkOneConstraint(c, refContract) {
        let res = true;

        if (c.type === Constraint.TYPE_TRANSACTIONAL) {
            if ((c.transactional_id == null) ||
                (refContract.transactional == null) ||
                (refContract.transactional.id == null) ||
                (c.transactional_id === "") ||
                (refContract.transactional.id === "")) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id + ")", "transactional is missing"));
            } else {
                if (c.transactional_id != null && refContract.transactional == null) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id + ")", "transactional not found"));
                } else if (c.transactional_id !== refContract.transactional.id) {
                    res = false;
                    this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id + ")", "transactional_id mismatch"));
                }
            }
        }

        if (c.contract_id != null) {
            if (!c.contract_id.equals(refContract.id)) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id + ")", "contract_id mismatch"));
            }
        }

        if (c.origin != null) {
            if (!c.origin.equals(refContract.getOrigin())) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_REF, "contract (hashId=" + this.id + ")", "origin mismatch"));
            }
        }

        for (let refRole of c.signed_by) {
            if (!refContract.isSignedBy(refRole)) {
                res = false;
                this.errors.push(new ErrorRecord(Errors.BAD_SIGNATURE, "contract (hashId=" + this.id + ")", "fingerprint mismatch"));
            }
        }

        return res;
    }

    isSignedBy(role) {
        if (role == null)
            return false;

        if (role instanceof roles.RoleLink)
            role  = role.resolve();

        if (role == null)
            return false;

        return role.isAllowedForKeys(this.effectiveKeys.keys());
    }

    setEffectiveKeys(additionalSignatures) {
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
    }

    async verifySignatures() {
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
    }

    async verifySealedKeys(isQuantise) {
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
            throw new ex.IllegalArgumentError("wrong object type, unicapsule required");


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
    }

    async copy() {
        let bbm = BossBiMapper.getInstance();

        return await bbm.deserialize(await bbm.serialize(this));

    }

    /**
     * Create new revision of contract.
     *
     * @param {Iterable<crypto.PrivateKey> | null} keys - Creator keys for new revision.
     * @returns {Contract} new revision of a contract.
     */
    async createRevision(keys = null) {
        let newRevision = await this.copy();

        newRevision.state.revision = this.state.revision + 1;
        newRevision.state.createdAt = new Date();
        newRevision.state.parent = this.id;
        newRevision.state.origin = this.state.revision === 1 ? this.id : this.state.origin;
        newRevision.revokingItems.add(this);
        newRevision.transactional = null;

        if (newRevision.definition != null && newRevision.definition.constraints != null) {
            for (let constr of newRevision.definition.constraints) {
                constr.setContract(newRevision);
                newRevision.constraints.set(constr.name, constr);
            }
        }
        if (newRevision.state != null && newRevision.state.constraints != null) {
            for (let constr of newRevision.state.constraints) {
                constr.setContract(newRevision);
                newRevision.constraints.set(constr.name, constr);
            }
        }

        if (keys != null) {
            let addresses = new Set();
            for (let k of keys) {
                addresses.add(k.publicKey.longAddress);
                newRevision.keysToSignWith.add(k);
            }
            let creator = new roles.SimpleRole("creator", addresses);
            newRevision.registerRole(creator);
        }

        return newRevision;
    }

    /**
     * Split contract into several branches.
     *
     * @param count {number} - Count of contracts to split from current.
     * @returns {Array<Contract>} of contracts split.
     */
    async split(count) {
        // we can split only the new revision and only once this time
        if (this.state.getBranchRevision() === this.state.revision)
            throw new ex.IllegalStateError("this revision is already split");
        if (count < 1)
            throw new ex.IllegalArgumentError("split: count should be > 0");

        // initialize context if not yet
        this.updateContext();

        this.state.setBranchNumber(0);
        let results = [];
        for (let i = 0; i < count; i++) {
            // we can't create revision as this is already a new revision, so we copy self:
            let c = await this.copy();
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
    }

    /**
     * Split this contract extracting specified value from a named field. The contract must have suitable
     * {@link SplitJoinPermission} and be signed with proper keys to pass checks.
     *
     * Important. This contract must be a new revision: call {@link #createRevision} first.
     *
     * @param {string} fieldName - Name of field to extract from
     * @param {number | string | BigDecimal} valueToExtract - How much to extract
     *
     * @return {Contract} new sibling contract with the extracted value.
     */
     async splitValue(fieldName, valueToExtract)  {
        let sibling = (await this.split(1))[0];

        if (typeof this.state.data[fieldName] !== "string")
            throw new ex.IllegalArgumentError("splitValue: illegal amount in field state.data." + fieldName);
        let value = new BigDecimal(this.state.data[fieldName]);

        this.state.data[fieldName] = value.sub(valueToExtract).toFixed();
        sibling.state.data[fieldName] = new BigDecimal(valueToExtract).toFixed();

        return sibling;
    }

    initializeWithDsl(root) {
        this.apiLevel = root.api_level;
        this.definition = new Definition(this).initializeWithDsl(root.definition);
        this.state = (new State(this)).initializeWithDsl(root.state);

        // fill constraints list
        if (this.definition != null && this.definition.constraints != null) {
            for (let constr of this.definition.constraints) {
                constr.setContract(this);
                this.constraints.set(constr.name, constr);
            }
        }

        if (this.state != null && this.state.constraints != null) {
            for (let constr of this.state.constraints) {
                constr.setContract(this);
                this.constraints.set(constr.name, constr);
            }
        }

        // now we have all roles, we can build permissions:
        this.definition.scanDslPermissions(root.definition);
        return this;
    }

    /**
     * Resolve object describing role and create either: - new role object - symlink to named role instance, ensure it
     * is register and return it, if it is a Map, tries to construct and register {@see Role} then return it.
     *
     * @param {string} roleName - Name of the role.
     * @param {object} roleObject - Is object for role creating.
     *
     * @return {Role} role.
     * @throws If can't make role.
     */
    createRole(roleName, roleObject) {
        if (typeof roleObject === "string")
            return this.registerRole(new roles.RoleLink(roleName, roleObject));

        if (roleObject instanceof roles.Role && roleObject.name != null)
            if (roleObject.name === roleName)
                return this.registerRole(roleObject);
            else
                return this.registerRole(new roles.RoleLink(roleName, roleObject.name));

        if (Object.getPrototypeOf(roleObject) === Object.prototype)
            return this.registerRole(roles.Role.fromDsl(roleName, roleObject));

        throw new ex.IllegalArgumentError("cant make role from " + JSON.stringify(roleObject));
    }

    isU(issuerKeys, issuerName) {
        let issuer = this.roles.issuer;
        if(!(issuer instanceof roles.SimpleRole))
            return false;

        let thisIssuerAddresses = new t.GenericSet(issuer.keyAddresses);

        Array.from(issuer.keyRecords.keys()).forEach(pk => thisIssuerAddresses.add(pk.shortAddress));

        if (!issuerKeys.some(k => thisIssuerAddresses.has(k)))
            return false;

        return issuerName === this.definition.data.issuerName;
    }

    createTransactionalSection() {
        if (this.transactional == null)
            this.transactional = new Transactional(this);
    }

    /**
     * Object to hold any data client might want to keep per one transaction.
     *
     * @return {Object} data from transactional section.
     */
    getTransactionalData() {
        if (this.transactional == null)
            this.createTransactionalSection();
        return this.transactional.data;
    }

    /**
     * Set expiration date of contract.
     *
     * @param {Date} dateTime - Expiration date to set.
     */
    setExpiresAt(dateTime) {
        this.state.expiresAt = dateTime;
        this.state.expiresAt.setMilliseconds(0);
    }

    /**
     * Creates a default empty new contract using a provided key as issuer and owner and sealer. Default expiration is
     * set to 90 days.
     * <p>
     * This constructor adds key as sealing signature so it is ready to {@link #seal()} just after construction, thought
     * it is necessary to put real data to it first. It is allowed to change owner, expiration and data fields after
     * creation (but before sealing).
     * <p>
     * Change owner permission is added by default
     * @param {PrivateKey} key for creating roles "issuer", "owner", "creator" and signing the contract
     * @param contract - init contract (example, NSmartContract). Optional.
     * @returns {Contract | NSmartContract | SlotContract | UnsContract | FollowerContract} created contract
     */
    static fromPrivateKey(key, contract = undefined) {
        let c = (contract === undefined) ? new Contract() : contract;
        let now = new Date();
        now.setDate(now.getDate() + 90);
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
    }

    /**
     * Extract contract from v2 or v3 sealed form, getting revoking and new items from sealed unicapsule and referenced items from
     * the transaction pack supplied.
     * <p>
     * It is recommended to call {@link #check()} after construction to see the errors.
     *
     * @param {Uint8Array} sealed binary sealed contract.
     * @param {TransactionPack} transactionPack the transaction pack to resolve dependencies against.
     * @param contract - init contract (example, NSmartContract). Optional.
     * @returns {Contract | NSmartContract | SlotContract | UnsContract | FollowerContract} extracted contract
     */
    static async fromSealedBinary(sealed, transactionPack = null, contract = undefined) {
        let result = (contract === undefined) ? new Contract() : contract;
        if (transactionPack == null)
            transactionPack = new TransactionPack(result);

        result.sealedBinary = sealed;
        result.id = crypto.HashId.of(sealed);
        result.transactionPack = transactionPack;
        result.isNeedVerifySealedKeys = true;
        let data = Boss.load(sealed);
        if(data.type !== "unicapsule") {
            throw new ex.IllegalArgumentError("wrong object type, unicapsule required");
        }

        result.apiLevel = data.version;
        let contractBytes = data.data;
        let payload = Boss.load(contractBytes,null);
        await result.deserialize(payload.contract, BossBiMapper.getInstance());

        if(result.apiLevel < 3) {
            if(payload.hasOwnProperty("revoking"))
                for(let packed of payload.revoking) {
                    let c = await Contract.fromSealedBinary(packed,transactionPack);
                    result.revokingItems.add(c);
                    transactionPack.addSubItem(c);
                }

            if(payload.hasOwnProperty("new"))
                for(let packed of payload.new) {
                    let c = await Contract.fromSealedBinary(packed,transactionPack);
                    result.newItems.add(c);
                    transactionPack.addSubItem(c);
                }
        } else {
            if(payload.hasOwnProperty("revoking"))
                for(let b of payload.revoking) {
                    let hid = await BossBiMapper.getInstance().deserialize(b);
                    let r = transactionPack.subItems.get(hid);
                    if(r != null) {
                        result.revokingItems.add(r);
                    } else {

                        result.errors.push(new ErrorRecord(Errors.BAD_REVOKE,"Revoking item was not found in the transaction pack"));
                    }
                }

            if(payload.hasOwnProperty("new"))
                for(let b of payload.new) {
                    let hid = await BossBiMapper.getInstance().deserialize(b);
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
    }

    static fromSealedV2Binary(sealed, data, transactionPack) {

        //TODO:
    }

    /**
     * Create a contract by importing its parameters of the transferred .yaml file. Signatures are not automatically added.
     * It is required to add signatures before check.
     *
     * @param {string} fileName - Path to file containing YAML representation of a contract.
     * @param contract - init contract (example, NSmartContract). Optional.
     * @return {Promise<Contract | NSmartContract | SlotContract | UnsContract | FollowerContract>} initialized contract.
     */
    static async fromDslFile(fileName, contract = undefined) {
        let input = await io.openRead(fileName);
        let data = await input.allAsString();
        await input.close();

        let root = await DefaultBiMapper.getInstance().deserialize(yaml.load(data));

        let c = (contract === undefined) ? new Contract() : contract;
        return c.initializeWithDsl(root);
    }

    /**
     * Main .unicon read routine. Load any .unicon version and construct a linked Contract with counterparts (new and
     * revoking items if present) and corresponding {@see TransactionPack} instance to pack it to store or send to
     * approval.
     * <p>
     * The supported file variants are:
     * <p>
     * - v2 legacy unicon. Is loaded with packed counterparts if any. Only for compatibility, avoid using it.
     * <p>
     * - v3 compacted unicon. Is loaded without counterparts, should be added later if need with {@see #newItems}
     * and {@see #revokingItems}. This is a good way to keep the long
     * contract chain.
     * <p>
     * - v4 compacted unicon with arithmetical expressions in constraints.
     * <p>
     * - packed {@see TransactionPack}. This is a preferred way to keep current contract state.
     * <p>
     * To pack and write corresponding .unicon file use {@see #getPackedTransaction}.
     *
     * @param packedItem some packed from of the universa contract
     * @return {Contract} unpacked contract
     */
    static async fromPackedTransaction(packedItem) {
        let tp = await TransactionPack.unpack(packedItem);
        return tp.contract;
    }

    /**
     * Pack the contract to the most modern .unicon format, same as {@see TransactionPack#pack}. Uses bounded
     * {@see TransactionPack} instance to save together the contract, revoking and new items (if any). This is a binary
     * format using to submit for approval. Use {@see #fromPackedTransaction} to read this format.
     *
     * @return {number[]} packed binary form.
     */
    async getPackedTransaction() {
        if (this.transactionPack == null)
            this.transactionPack = new TransactionPack(this);
        return await this.transactionPack.pack();
    }

    /**
     * Checks contract is set unlimited requests for a key.
     * Errors found can be accessed with {@link #errors}.
     *
     * @param {Config} config - Current node configuration
     * @return {boolean} true if contract set unlimited requests for a key
     */
    isUnlimitKeyContract(config) {
        try {
            // check transactional
            if (this.transactional == null || this.transactional.data == null || Object.entries(this.transactional.data).length !== 1)
                return false;

            // check revoking contract
            if (this.newItems.size !== 0 || this.revokingItems.size !== 1)
                return false;

            if (!Array.from(this.revokingItems)[0].id.equals(this.state.parent))
                return false;

            // check U contracts
            if (!this.isU(config.uIssuerKeys, Config.uIssuerName))
                return false;

            if (!Array.from(this.revokingItems)[0].isU(config.uIssuerKeys, Config.uIssuerName))
                return false;

            // check unlimited key
            if (!this.transactional.data.hasOwnProperty("unlimited_key"))
                return false;
        }
        catch (err) {
            return false;
        }

        try {
            // get unlimited key
            let packedKey = this.transactional.data.unlimited_key;
            if (packedKey == null) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "Invalid format of key for unlimited requests"));
                return false;
            }

            let key = new crypto.PublicKey(packedKey);
            if (key == null) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "Invalid format of key for unlimited requests"));
                return false;
            }
        }
        catch (err) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "Invalid format of key for unlimited requests: " + err.message));
            return false;
        }

        try {
            // check payment
            let calculatedPayment = Array.from(this.revokingItems)[0].state.data.transaction_units - this.state.data.transaction_units;

            if (calculatedPayment !== Config.rateLimitDisablingPayment) {
                this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "",
                    "Payment for setting unlimited requests must be " + Config.rateLimitDisablingPayment + "U"));
                return false;
            }
        }
        catch (err) {
            this.errors.push(new ErrorRecord(Errors.FAILED_CHECK, "", "Error checking payment for setting unlimited requests: " + err.message));
            return false;
        }

        return true;
    }
}


Contract.testQuantaLimit = -1;
Contract.JSAPI_SCRIPT_FIELD = "scripts";


DefaultBiMapper.registerAdapter(new bs.BiAdapter("UniversaContract",Contract));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {Contract};
