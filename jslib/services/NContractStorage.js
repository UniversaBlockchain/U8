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
    }

    getExpiresAt() {
        return this.expiresAt;
    }

    async getContract() {
        try {
            this.trackingContract = await Contract.fromPackedTransaction(this.packedContract);
        } catch (e) {
            throw new ex.IllegalArgumentError("NContractStorage unable to unpack TP " + e.message);
        }

        return this.trackingContract;
    }

    getPackedContract() {
        return this.packedContract;
    }

    async deserialize(data, deserializer) {
        this.packedContract = data.packedContract;
        this.trackingContract = await Contract.fromPackedTransaction(this.packedContract);
        this.expiresAt = await deserializer.deserialize(data.expiresAt);
    }

    async serialize(serializer) {
        return {
            packedContract : await serializer.serialize(this.packedContract),
            expiresAt : await serializer.serialize(this.expiresAt)
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