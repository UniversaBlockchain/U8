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
    constructor(contract) {
        this.subItems = new t.GenericMap();
        this.referencedItems = new t.GenericMap();
        this.keysForPack = new t.GenericSet();
        this.contract = contract;
        if(contract) {
            this.extractAllSubItemsAndReferenced(contract);
            this.contract.transactionPack = this;
        }
        this.packedBinary = null;
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

    deserialize(data, deserializer) {
        if(data.hasOwnProperty("keys")) {
            for(let keyBinary of deserializer.deserialize(data.keys)) {
                this.keysForPack.add(new crypto.PublicKey(keyBinary));
            }
        }

        if(data.hasOwnProperty("referencedItems")) {
            for(let referencedBinary of deserializer.deserialize(data.referencedItems)) {
                let c = new Contract.fromSealedBinary(referencedBinary, this);
                this.referencedItems.set(c.id, c);
            }
        }

        let missingIds = new t.GenericSet();
        let allDeps = [];
        for(let subitemBinary of deserializer.deserialize(data.subItems)) {
            let deps = new ContractDependencies(subitemBinary);
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
                    let c = Contract.fromSealedBinary(allDeps[i].binary, this);
                    this.subItems.set(c.id,c);
                    missingIds.delete(c.id);
                    allDeps.splice(i,1);
                    i--;
                }
            }

            if(!removed)
                throw new ex.IllegalStateError("circle deps in contracts tree");
        }

        let bin = deserializer.deserialize(data.contract);

        if (data.extended_type != null) {
            // dynamic import
            if (this.NSmartContract == null)
                this.NSmartContract = require("services/NSmartContract").NSmartContract;

            if (this.NSmartContract.SmartContractType.hasOwnProperty(data.extended_type)) {
                switch (data.extended_type) {
                    case this.NSmartContract.SmartContractType.N_SMART_CONTRACT:
                        this.contract = this.NSmartContract.fromSealedBinary(bin, this);
                        break;

                    case this.NSmartContract.SmartContractType.SLOT1:
                        this.contract = SlotContract.fromSealedBinary(bin, this);
                        break;

                    case this.NSmartContract.SmartContractType.UNS1:
                        this.contract = UnsContract.fromSealedBinary(bin, this);
                        break;

                    case this.NSmartContract.SmartContractType.FOLLOWER1:
                        this.contract = FollowerContract.fromSealedBinary(bin, this);
                        break;
                }
            }
        } else
            this.contract = Contract.fromSealedBinary(bin, this);
    }

    serialize(serializer) {

        let subItemBinaries = [];
        for(let si of this.subItems.values()) {
            subItemBinaries.push(si.sealedBinary);
        }

        let res = {
            contract : this.contract.sealedBinary,
            subItems : subItemBinaries
        };

        if(this.referencedItems.size > 0) {
            let referencesItemBinaries = [];
            for(let ri of this.referencedItems.values()) {
                referencesItemBinaries.push(ri.sealedBinary);
            }
            res.referencedItems = referencesItemBinaries;
        }

        if(this.keysForPack.size > 0) {
            let keyBinaries = [];
            for(let key of this.keysForPack) {
                keyBinaries.push(key.packed);
            }
            res.keys = keyBinaries;
        }

        if(this.contract.definition.extendedType) {
            res.extended_type = this.contract.definition.extendedType;
        }

        return serializer.serialize(res);
    }

    pack() {
        if(this.packedBinary === null) {
            this.packedBinary = Boss.dump(BossBiMapper.getInstance().serialize(this));
        }
        return this.packedBinary;
    }

    static unpack(bytes) {
        let x = Boss.load(bytes);

        let res = BossBiMapper.getInstance().deserialize(x);
        if (res instanceof TransactionPack)
            return res;

        let c = Contract.fromSealedBinary(bytes);
        return c.transactionPack;
    }
}


function ContractDependencies(binary) {
    this.id = crypto.HashId.of(binary);
    this.binary = binary;
    this.dependencies = new t.GenericSet();
    let data = Boss.load(binary);
    let contractBytes = data.data;
    let serializedContract = Boss.load(contractBytes);
    this.extendedType = serializedContract.contract.definition.hasOwnProperty("extended_type") ?
        serializedContract.contract.definition.extended_type : null;
    let apiLevel = data.version;
    if(apiLevel >= 3) {
        for(let id of BossBiMapper.getInstance().deserialize(serializedContract.revoking)) {
            this.dependencies.add(id);
        }

        for(let id of BossBiMapper.getInstance().deserialize(serializedContract.new)) {
            this.dependencies.add(id);
        }
    }
}


DefaultBiMapper.registerAdapter(new BiAdapter("TransactionPack",TransactionPack));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {TransactionPack};