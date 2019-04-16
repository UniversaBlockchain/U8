const bs = require("biserializable");

/**
 * Implements {@see ContractSubscription} interface for contract.
 */
class NContractSubscription extends ContractSubscription, bs.BiSerializable {

    constructor(hashId, isChainSubscription, expiresAt) {
        super();
        this.hashId = hashId;
        this.isChainSubscription = isChainSubscription;
        this.expiresAt = expiresAt;
    }

    expiresAt() {
        return this.expiresAt;
    }

    getHashId() {
        return this.hashId;
    }

    getContractId() {
        if (!this.isChainSubscription)
            return this.hashId;
        else
            return null;
    }

    getOrigin() {
        if (this.isChainSubscription)
            return this.hashId;
        else
            return null;
    }

    isChainSubscription() {
        return this.isChainSubscription;
    }

    deserialize(data, deserializer) {
        this.hashId = deserializer.deserialize(data.hashId);
        this.isChainSubscription = data.isChainSubscription;
        this.expiresAt = deserializer.deserialize(data.expiresAt);
    }

    serialize(serializer) {
        return {
            hashId : serializer.serialize(this.hashId),
            isChainSubscription : this.isChainSubscription,
            expiresAt : serializer.serialize(this.expiresAt)
        };
    }
}