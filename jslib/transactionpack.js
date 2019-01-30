const BiAdapter = require("biserializable").BiAdapter;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BossBiMapper = require("bossbimapper").BossBiMapper;
const t = require("tools");
const Boss = require("boss");
//const Contract = require("contract").Contract;

///////////////////////////
//TransactionPack
///////////////////////////

function TransactionPack(contract) {
    this.subItems = new Map();
    this.referencedItems = new Map();
    this.keysForPack = new Set();
    this.contract = contract;
    if(contract) {
        this.extractAllSubItemsAndReferenced(contract);
        this.contract.transactionPack = this;
    }
    this.packedBinary = null;
}



TransactionPack.prototype.extractAllSubItemsAndReferenced = function(contract) {
    for(let c of contract.revokingItems) {
        this.subItems.set(c.id,c);
    }

    for(let c of contract.newItems) {
        this.subItems.set(c.id,c);
        this.extractAllSubItemsAndReferenced(c);
    }

    //TODO:referenced
};


function ContractDependencies(binary) {
    this.id = crypto.HashId.of(binary);
    this.binary = binary;
    this.dependencies = new Set();
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



TransactionPack.prototype.deserialize = function(data,deserializer) {
    if(data.hasOwnProperty("keys")) {
        for(let keyBinary of deserializer.deserialize(data.keys)) {
            this.keysForPack.add(new crypto.PublicKey(keyBinary));
        }
    }

    if(data.hasOwnProperty("referencedItems")) {
        for(let referencedBinary of deserializer.deserialize(data.referencedItems)) {
            this.referencedItems.add(new Contract(referencedBinary,this));
        }
    }

    let subitemBinaries = deserializer.deserialize(data.subItems)

    let missingIds = new Set();
    let allDeps = [];
    for(let subitemBinary of subitemBinaries) {
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
                let c = new Contract.fromSealedBinary(allDeps[i].binary,this);
                this.subItems.set(c.id,c);
                missingIds.delete(c.id);
                allDeps.splice(i,1);
                i--;
            }
        }

        if(!removed)
            throw "circle deps in contracts tree";
    }

    this.contract = Contract.fromSealedBinary(deserializer.deserialize(data.contract),this);

};

TransactionPack.prototype.serialize = function(serializer) {
    let subItemBinaries = [];
    for(let si of this.subItems.values()) {
        subItemBinaries.push(si.sealedBinary);
    }

    res = {
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
};

TransactionPack.prototype.pack = function() {
    if(this.packedBinary === null) {
        this.packedBinary = Boss.dump(BossBiMapper.getInstance().serialize(this));
    }
    return this.packedBinary;
};

TransactionPack.unpack = function(bytes) {
    let x = Boss.load(bytes);
    let res = BossBiMapper.getInstance().deserialize(x);
    if(res instanceof TransactionPack) {
        return res;
    }

    let c = new Contract(bytes);
    return c.transactionPack;
};


DefaultBiMapper.registerAdapter(new BiAdapter("TransactionPack",TransactionPack));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {TransactionPack};