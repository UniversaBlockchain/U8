const bs = require("biserializable");
const ex = require("exceptions");

/**
 * Implements {@see ContractStorage} interface for contract.
 */
class NContractStorage extends ContractStorage, bs.BiSerializable {

    constructor(packedContract, expiresAt) {
        super();
        this.packedContract = packedContract;
        this.expiresAt = expiresAt;
        this.id = 0;

        try {
            this.trackingContract = Contract.fromPackedTransaction(packedContract);
        } catch (e) {
            throw new ex.IllegalArgumentError("NContractStorage unable to unpack TP " + e.message);
        }
    }

    expiresAt() {
        return this.expiresAt;
    }

    getContract() {
        return this.trackingContract;
    }

    getPackedContract() {
        return this.packedContract;
    }

    deserialize(data, deserializer) {
        this.packedContract = data.packedContract;
        this.trackingContract = Contract.fromPackedTransaction(this.packedContract);
        this.expiresAt = deserializer.deserialize(data.expiresAt);
    }

    serialize(serializer) {
        return {
            packedContract : serializer.serialize(this.packedContract),
            expiresAt : serializer.serialize(this.expiresAt)
        };
    }
}
