/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const ex = require("exceptions");

class UnsRecord extends bs.BiSerializable {

    static ADDRESSES_FIELD_NAME = "addresses";
    static ORIGIN_FIELD_NAME = "origin";
    static DATA_FIELD_NAME = "data";

    constructor() {
        super();
        this.unsAddresses = [];
        this.unsOrigin = null;
        this.unsData = null;
    }

    /**
     * Initialize {@link UnsRecord} from origin.
     *
     * @param {HashId} origin.
     *
     * @return {UnsRecord} initialized UNS record.
     */
    static fromOrigin(origin) {
        let record = new UnsRecord();
        record.unsOrigin = origin;
        return record;
    }

    /**
     * Initialize {@link UnsRecord} from {@link crypto.KeyAddress}.
     *
     * @param {crypto.KeyAddress} address.
     *
     * @return {UnsRecord} initialized UNS record.
     */
    static fromAddress(address) {
        let record = new UnsRecord();
        record.unsAddresses.push(address);
        return record;
    }

    /**
     * Initialize {@link UnsRecord} from short and long {@link crypto.KeyAddress}.
     *
     * @param {crypto.KeyAddress} short address.
     * @param {crypto.KeyAddress} long address.
     *
     * @return {UnsRecord} initialized UNS record.
     */
    static fromAddresses(short, long) {
        let record = new UnsRecord();
        record.unsAddresses.push(short);
        record.unsAddresses.push(long);
        return record;
    }

    /**
     * Initialize {@link UnsRecord} from {@link PublicKey}.
     *
     * @param {crypto.PublicKey} key for generate {@link crypto.KeyAddress} of UNS record.
     * @param {number} keyMark for generate {@link crypto.KeyAddress} of UNS record. Optional. 0 by default.
     *
     * @return {UnsRecord} initialized UNS record.
     */
    static fromKey(key, keyMark = 0) {
        let record = new UnsRecord();
        record.unsAddresses.push(new crypto.KeyAddress(key, keyMark, false));
        record.unsAddresses.push(new crypto.KeyAddress(key, keyMark, true));
        return record;
    }

    /**
     * Initialize {@link UnsRecord} from data.
     *
     * @param {Object} data for generate UNS record.
     *
     * @return {UnsRecord} initialized UNS record.
     */
    static fromData(data) {
        let record = new UnsRecord();
        record.unsData = data;
        return record;
    }

    /**
     * Method calls from {@link UnsContract#fromDslFile(String)} and initialize UNS record from given root object.
     *
     * @param {Object} root object with initialized data.
     *
     * @return {UnsRecord} created and ready {@link UnsRecord}.
     */
    initializeWithDsl(root) {
        if (root[UnsRecord.ORIGIN_FIELD_NAME] != null)
            this.unsOrigin = crypto.HashId.withDigest(root[UnsRecord.ORIGIN_FIELD_NAME]);
        else if (root[UnsRecord.DATA_FIELD_NAME] != null)
            this.unsData = root[UnsRecord.DATA_FIELD_NAME];
        else {
            root[UnsRecord.ADDRESSES_FIELD_NAME].forEach(addr => {
                try {
                    this.unsAddresses.push(new crypto.KeyAddress(addr));
                } catch (err) {
                    throw new ex.IllegalArgumentError("Error converting address from base58 string: " + err.message);
                }
            });
        }

        return this;
    }

    /**
     * Check {@link UnsRecord} contains {@link crypto.KeyAddress}.
     *
     * @param {crypto.KeyAddress} address.
     *
     * @return {boolean} if UNS record contains address.
     */
    isMatchingAddress(address) {
        return this.unsAddresses.some(addr => addr.packed.equals(address.packed));
    }

    /**
     * Check {@link UnsRecord} contains address of {@link PublicKey}.
     *
     * @param {PublicKey} key.
     *
     * @return {boolean} if UNS record contains address of key.
     */
    isMatchingKey(key) {
        return this.unsAddresses.some(addr => addr.match(key));
    }

    /**
     * Check {@link UnsRecord} contains origin.
     *
     * @param {HashId} origin.
     *
     * @return {boolean} if UNS record contains origin.
     */
    isMatchingOrigin(origin) {
        if (this.unsOrigin == null)
            return origin == null;

        return origin.equals(this.unsOrigin);
    }

    /**
     * Compare {@link UnsRecord} with {@link NameRecordEntry}.
     *
     * @param {NameRecordEntry} entry.
     *
     * @return {boolean} true if records is equals.
     */
    equalsTo(entry) {
        let longAddress = null;
        let shortAddress = null;

        this.unsAddresses.forEach(addr => {
            if (addr.toString().length === 72)
                longAddress = addr.toString();
            else
                shortAddress = addr.toString();
        });

        // TODO: add comparison unsData
        return (((this.unsOrigin != null && entry.getOrigin() != null && this.unsOrigin.equals(entry.getOrigin())) ||
                 (this.unsOrigin == null && entry.getOrigin() == null)) &&
                ((longAddress != null && entry.getLongAddress() != null && longAddress.equals(entry.getLongAddress())) ||
                 (longAddress == null && entry.getLongAddress() == null)) &&
                ((shortAddress != null && entry.getShortAddress() != null && shortAddress.equals(entry.getShortAddress())) ||
                 (shortAddress == null && entry.getShortAddress() == null)));
    }

    async serialize(serializer) {
        let data = {};
        if (this.unsAddresses.length > 0)
            data.addresses = await serializer.serialize(this.unsAddresses);

        if (this.unsOrigin != null)
            data.origin = await serializer.serialize(this.unsOrigin);

        if (this.unsData != null)
            data.data = await serializer.serialize(this.unsData);

        return data;
    }

    async deserialize(data, deserializer) {
        if (data.hasOwnProperty("addresses"))
            this.unsAddresses = await deserializer.deserialize(data.addresses);

        if (data.hasOwnProperty("origin"))
            this.unsOrigin = await deserializer.deserialize(data.origin);

        if (data.hasOwnProperty("data"))
            this.unsData = await deserializer.deserialize(data.data);
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.unsAddresses, to.unsAddresses))
            return false;

        if(!t.valuesEqual(this.unsOrigin, to.unsOrigin))
            return false;

        return t.valuesEqual(this.unsData, to.unsData);
    }
}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("com.icodici.universa.contract.services.UnsRecord", UnsRecord));   //TODO: crutch

module.exports = {UnsRecord};