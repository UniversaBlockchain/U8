const ContractStorage = require("services/contractStorage").ContractStorage;
const ex = require("exceptions");
const t = require("tools");

/**
 * Implements {@see ContractStorage} interface for contract.
 */
class NContractStorage extends ContractStorage {

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

    getExpiresAt() {
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

    toString() {
        return crypto.HashId.of(t.randomBytes(64));
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }
}

module.exports = {NContractStorage};