const ContractSubscription = require("services/contractSubscription").ContractSubscription;

/**
 * Implements {@see ContractSubscription} interface for contract.
 */
class NContractSubscription extends ContractSubscription {

    constructor(hashId, isChainSubscription, expiresAt) {
        super();
        this.id = 0;
        this.hashId = hashId;
        this.isChainSubscription = isChainSubscription;
        this.expiresAt = expiresAt;
    }

    getExpiresAt() {
        return this.expiresAt;
    }

    getIsChainSubscription() {
        return this.isChainSubscription;
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

module.exports = {NContractSubscription};