/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const ex = require("exceptions");
const BiAdapter = require("biserializable").BiAdapter;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const NodeInfoProvider = require("services/NSmartContract").NodeInfoProvider;
const BigDecimal = require("big").Big;

class NodeConfigProvider extends bs.BiSerializable {
    constructor(config) {
        super();
        this.config = config;
    }

    getUIssuerKeys() {
        if (this.config != null)
            return this.config.getUIssuerKeys();
        else
            return this.issuerKeyAddresses;
    }

    getUIssuerName() {
        if (this.config != null)
            return this.config.getUIssuerName();
        else
            return this.issuerName;
    }

    getMinPayment( extendedType) {
        if (this.config != null)
            return this.config.getMinPayment(extendedType);
        else
            return this.minPayment[extendedType];
    }

    getServiceRate(extendedType) {
        if (this.config != null)
            return this.config.getServiceRate(extendedType);
        else
            return this.rate[extendedType];
    }

    getAdditionalKeysAddressesToSignWith(extendedType) {
        if (this.config != null) {
            if (NSmartContract.SmartContractType.UNS1.name().equals(extendedType))
                return [this.config.getAuthorizedNameServiceCenterAddress()];
            else
                return [];
        } else
            return this.additionalKeyAddresses[extendedType];
    }

    async serialize(serializer) {
        // TODO
    }

    async deserialize(data, deserializer) {
        this.issuerKeyAddresses = new Set(await deserializer.deserialize(data.issuer_keys));
        this.issuerName = data.issuer_name;
        this.minPayment = await deserializer.deserialize(data.min_payment);
        this.additionalKeyAddresses = await deserializer.deserialize(data.additional_keys);

        let r = await deserializer.deserialize(data.rate);
        this.rate = new Map();
        if (r == null && typeof r !== "object")
            throw new ex.IllegalArgumentError("NodeConfigProvider deserialize failed: rate must be object");

        for (let rs of Object.keys(r))
            this.rate.set(rs, new BigDecimal(r[rs]));
    }
}

DefaultBiMapper.registerAdapter(new BiAdapter("NodeConfigProvider", NodeConfigProvider));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {NodeConfigProvider};