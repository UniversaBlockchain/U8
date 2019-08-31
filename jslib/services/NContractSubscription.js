/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const ContractSubscription = require("services/contractSubscription").ContractSubscription;
const t = require("tools");

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

    async deserialize(data, deserializer) {
        this.hashId = await deserializer.deserialize(data.hashId);
        this.isChainSubscription = data.isChainSubscription;
        this.expiresAt = await deserializer.deserialize(data.expiresAt);
    }

    async serialize(serializer) {
        return {
            hashId : await serializer.serialize(this.hashId),
            isChainSubscription : this.isChainSubscription,
            expiresAt : await serializer.serialize(this.expiresAt)
        };
    }

    toString() {
        return crypto.HashId.of(t.randomBytes(64)).base64;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }
}

module.exports = {NContractSubscription};