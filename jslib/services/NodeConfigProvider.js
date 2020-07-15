/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const ex = require("exceptions");
const BiAdapter = require("biserializable").BiAdapter;
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const BigDecimal = require("big").Big;

class NodeConfigProvider extends bs.BiSerializable {
    constructor(config) {
        super();
        this.config = config;
    }

    getUIssuerKeys() {
        if (this.config != null)
            return this.config.uIssuerKeys;
        else
            return this.issuerKeyAddresses;
    }

    getUIssuerName() {
        if (this.config != null)
            return this.config.uIssuerName;
        else
            return this.issuerName;
    }

    getMinPayment( extendedType) {
        if (this.config != null)
            return this.config.minPayment[extendedType];
        else
            return this.minPayment[extendedType];
    }

    getServiceRate(extendedType) {
        if (this.config != null)
            return this.config.rate[extendedType];
        else
            return this.rate[extendedType];
    }

    getAdditionalKeysAddressesToSignWith(extendedType) {
        if (this.config != null) {
            if (NSmartContract.SmartContractType.UNS1.name().equals(extendedType))
                return [this.config.authorizedNameServiceCenterAddress];
            else
                return [];
        } else
            return this.additionalKeyAddresses[extendedType];
    }

    async serialize(serializer) {
        if (this.config != null) {
            this.issuerKeyAddresses = this.config.uIssuerKeys;
            this.issuerName = this.config.uIssuerName;
            this.minPayment = this.config.minPayment;
            this.rate = this.config.rate;
            this.additionalKeyAddresses = {};
            this.additionalKeyAddresses[NSmartContract.SmartContractType.UNS1] = [this.config.authorizedNameServiceCenterAddress];
        }

        let r = {};
        for (let rs of Object.keys(this.rate))
            r[rs] = this.rate[rs].toFixed();

        return {
            issuer_keys: await serializer.serialize(this.issuerKeyAddresses),
            issuer_name: this.issuerName,
            rate: await serializer.serialize(r),
            min_payment: await serializer.serialize(this.minPayment),
            additional_keys: await serializer.serialize(this.additionalKeyAddresses)
        };
    }

    async deserialize(data, deserializer) {
        this.issuerKeyAddresses = await deserializer.deserialize(data.issuer_keys);
        this.issuerName = data.issuer_name;
        this.minPayment = await deserializer.deserialize(data.min_payment);
        this.additionalKeyAddresses = await deserializer.deserialize(data.additional_keys);

        let r = await deserializer.deserialize(data.rate);
        this.rate = {};
        if (r == null && typeof r !== "object")
            throw new ex.IllegalArgumentError("NodeConfigProvider deserialize failed: rate must be object");

        for (let rs of Object.keys(r))
            this.rate[rs] = new BigDecimal(r[rs]);
    }
}

DefaultBiMapper.registerAdapter(new BiAdapter("NodeConfigProvider", NodeConfigProvider));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {NodeConfigProvider};