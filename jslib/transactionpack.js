/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const BiAdapter = require("biserializable").BiAdapter;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const t = require("tools");
const Boss = require("boss");
const ex = require("exceptions");

///////////////////////////
//TransactionPack
///////////////////////////

class TransactionPack {
    static TAG_PREFIX_RESERVED = "universa:";

    constructor(contract) {
        this.subItems = new t.GenericMap();
        this.referencedItems = new t.GenericMap();
        this.keysForPack = new t.GenericSet();
        this.taggedItems = new Map();
        this.contract = contract;
        if (contract) {
            this.extractAllSubItemsAndReferenced(contract);
            this.contract.transactionPack = this;
        }
        this.packedBinary = null;
        this.ubotId = null;
    }

    /**
     * Method add found contracts in the new items and revoking items to {@see TransactionPack#subItems} and do it
     * again for each new item.
     * Also method add to {@see TransactionPack#referencedItems} referenced contracts from given.
     * @param {Contract} contract - given contract to extract from.
     */
    extractAllSubItemsAndReferenced(contract) {
        for (let c of contract.revokingItems) {
            this.subItems.set(c.id, c);
            c.transactionPack = this;

            for (let ref of c.getReferencedItems())
                this.referencedItems.set(ref.id, ref);
        }

        for (let c of contract.newItems) {
            this.subItems.set(c.id, c);
            c.transactionPack = this;
            this.extractAllSubItemsAndReferenced(c);
        }

        for (let ref of contract.getReferencedItems())
            this.referencedItems.set(ref.id, ref);
    }

    setConstraintContextKeys(constraintEffectiveKeys) {
        this.contract.setConstraintContextKeys(constraintEffectiveKeys);
        this.subItems.values().forEach(si => si.setConstraintContextKeys(constraintEffectiveKeys));
        this.referencedItems.values().forEach(ri => ri.setConstraintContextKeys(constraintEffectiveKeys));
    }

    /**
     * Add tag to an item of transaction pack by its id
     *
     * Note: item with given id should exist in transaction pack as either main contract or subitem or referenced item
     *
     * @param {string} tag - Tag to add
     * @param {crypto.HashId} itemId - Id of an item to set tag for
     */
    addTag(tag, itemId) {
        let target = null;
        if (this.referencedItems.has(itemId))
            target = this.referencedItems.get(itemId);
        else if(this.subItems.has(itemId))
            target = this.subItems.get(itemId);
        else if(this.contract.id.equals(itemId))
            target = this.contract;

        if (target != null) {
            this.packedBinary = null;
            this.taggedItems.set(tag, target);
        } else
            throw new ex.IllegalArgumentError("Item with id " + itemId + " is not found in transaction pack");
    }

    addReferencedItem(referencedItem) {
        if (!this.referencedItems.has(referencedItem.id)) {
            this.packedBinary = null;
            this.referencedItems.set(referencedItem.id, referencedItem);
        }
    }

    async deserialize(data, deserializer) {
        if (this.Contract == null) {
            if (typeof Contract !== "undefined")
                this.Contract = Contract;
            else
                this.Contract = require("contract").Contract;
        }

        if(data.hasOwnProperty("keys")) {
            for(let keyBinary of await deserializer.deserialize(data.keys)) {
                this.keysForPack.add(new crypto.PublicKey(keyBinary));
            }
        }

        if(data.hasOwnProperty("referencedItems")) {
            for(let referencedBinary of data.referencedItems) {
                let c = await this.Contract.fromSealedBinary(referencedBinary, this);
                this.referencedItems.set(c.id, c);
            }
        }

        let missingIds = new t.GenericSet();
        let allDeps = [];
        for(let subitemBinary of data.subItems) {
            let deps = await ContractDependencies(subitemBinary);
            allDeps.push(deps);
            missingIds.add(deps.id);
        }

        while (allDeps.length > 0) {
            let removed = false;
            for(let i = 0; i < allDeps.length;i++) {

                let found = false;
                for(let id of allDeps[i].dependencies) {
                    if(missingIds.has(id)) {
                        found = true;
                        break;
                    }
                }

                if(!found) {
                    removed = true;
                    //TODO: NContracts
                    let c = await this.Contract.fromSealedBinary(allDeps[i].binary, this);
                    this.subItems.set(c.id,c);
                    missingIds.delete(c.id);
                    allDeps.splice(i,1);
                    i--;
                }
            }

            if(!removed)
                throw new ex.IllegalStateError("circle deps in contracts tree");
        }

        if (data.extended_type != null) {
            // dynamic import
            if (this.NSmartContract == null)
                this.NSmartContract = require("services/NSmartContract").NSmartContract;

            if (this.NSmartContract.SmartContractType.hasOwnProperty(data.extended_type)) {
                switch (data.extended_type) {
                    case this.NSmartContract.SmartContractType.N_SMART_CONTRACT:
                        this.contract = await this.NSmartContract.fromSealedBinary(data.contract, this);
                        break;

                    case this.NSmartContract.SmartContractType.SLOT1:
                        let SlotContract = require("services/slotContract").SlotContract;
                        this.contract = await SlotContract.fromSealedBinary(data.contract, this);
                        break;

                    case this.NSmartContract.SmartContractType.UNS1:
                    case this.NSmartContract.SmartContractType.UNS2:
                        let UnsContract = require("services/unsContract").UnsContract;
                        this.contract = await UnsContract.fromSealedBinary(data.contract, this);
                        break;

                    case this.NSmartContract.SmartContractType.FOLLOWER1:
                        let FollowerContract = require("services/followerContract").FollowerContract;
                        this.contract = await FollowerContract.fromSealedBinary(data.contract, this);
                        break;
                }
            }
        } else
            this.contract = await this.Contract.fromSealedBinary(data.contract, this);

        if (data.tags != null && typeof data.tags === "object")
            for (let tag of Object.keys(data.tags)) {
                // tags with reserved prefix can only be added at runtime
                // and can't be stored in packed transaction
                if (tag.startsWith(TransactionPack.TAG_PREFIX_RESERVED))
                    continue;

                this.addTag(tag, await deserializer.deserialize(data.tags[tag]));
            }
    }

    async serialize(serializer) {

        let subItemBinaries = [];
        for (let si of this.subItems.values()) {
            subItemBinaries.push(si.sealedBinary);
        }

        let res = {
            contract : this.contract.sealedBinary,
            subItems : subItemBinaries
        };

        if (this.referencedItems.size > 0) {
            let referencesItemBinaries = [];
            for (let ri of this.referencedItems.values()) {
                referencesItemBinaries.push(ri.sealedBinary);
            }
            res.referencedItems = referencesItemBinaries;
        }

        if (this.taggedItems.size > 0) {
            res.tags = {};
            for (let [k,v] of this.taggedItems)
                res.tags[k] = await serializer.serialize(v.id);
        }

        if (this.keysForPack.size > 0) {
            let keyBinaries = [];
            for (let key of this.keysForPack) {
                keyBinaries.push(key.packed);
            }
            res.keys = keyBinaries;
        }

        if (this.contract.definition.extendedType) {
            res.extended_type = this.contract.definition.extendedType;
        }

        return await serializer.serialize(res);
    }

    async pack() {
        if(this.packedBinary === null) {
            this.packedBinary = await Boss.dump(await BossBiMapper.getInstance().serialize(this));
        }
        return this.packedBinary;
    }

    static async unpack(bytes) {
        let x = await Boss.load(bytes);

        let res = await BossBiMapper.getInstance().deserialize(x);
        if (res instanceof TransactionPack)
            return res;

        let impContract = null;
        if (typeof Contract !== "undefined")
            impContract = Contract;
        else
            impContract = require("contract").Contract;

        let c = await impContract.fromSealedBinary(bytes);
        return c.transactionPack;
    }

    /**
     * Find contract in transaction pack by given predicate
     *
     * Note: if there is more than one contract that matches predicate a random one will be returned
     *
     * @param {Function} predicate - predicate to match contract by (Contract -> boolean)
     * @return {Contract} contract that matches predicate or null if no contract found
     */

    findContract(predicate) {
        if (predicate(this.contract))
            return this.contract;

        for (let si of this.subItems.values())
            if (predicate(si))
                return si;

        for (let si of this.referencedItems.values())
            if (predicate(si))
                return si;

        return null;
    }
}


async function ContractDependencies(binary) {
    let res = {};

    let data;
    if (binary.constructor.name === "Array") {
        // binary[0] contains boss.loaded object, binary[1] contains binary
        // its for nestedLoadMap mode, do not used now
        res.id = await crypto.HashId.of_async(binary[1]);
        res.binary = binary;//[1];
        res.dependencies = new t.GenericSet();
        data = binary[0];
    } else {
        res.id = await crypto.HashId.of_async(binary);
        res.binary = binary;
        res.dependencies = new t.GenericSet();
        data = await Boss.load(binary);
    }
    let contractBytes = data.data;
    let serializedContract;
    // contractBytes[0] contains boss.loaded object, contractBytes[1] contains binary
    // its for nestedLoadMap mode, do not used now
    if (contractBytes.constructor.name === "Array")
        serializedContract = contractBytes[0];
    else
        serializedContract = await Boss.load(contractBytes);
    res.extendedType = serializedContract.contract.definition.hasOwnProperty("extended_type") ?
        serializedContract.contract.definition.extended_type : null;
    let apiLevel = data.version;
    if(apiLevel >= 3) {
        for(let id of await BossBiMapper.getInstance().deserialize(serializedContract.revoking)) {
            res.dependencies.add(id);
        }

        for(let id of await BossBiMapper.getInstance().deserialize(serializedContract.new)) {
            res.dependencies.add(id);
        }
    }

    return res;
}


DefaultBiMapper.registerAdapter(new BiAdapter("TransactionPack",TransactionPack));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {TransactionPack};