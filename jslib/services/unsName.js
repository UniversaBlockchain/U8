/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const bs = require("biserializable");
const DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
const t = require("tools");

class UnsName extends bs.BiSerializable {

    static NAME_FIELD_NAME = "name";
    static NAME_REDUCED_FIELD_NAME = "reduced_name";
    static DESCRIPTION_FIELD_NAME = "description";

    constructor(name = undefined, description = undefined) {
        super();
        this.unsName = name;
        this.unsDescription = description;
        this.unsReducedName = null;
    }

    /**
     * Method calls from {@link UnsContract#fromDslFile(String)} and initialize UNS name from given root object.
     *
     * @param {Object} root object with initialized data.
     *
     * @return {UnsName} created and ready {@link UnsName}.
     */
    initializeWithDsl(root) {
        this.unsName = root[UnsName.NAME_FIELD_NAME];
        this.unsDescription = root[UnsName.DESCRIPTION_FIELD_NAME];

        return this;
    }

    // /**
    //  * Get UNS record count.
    //  *
    //  * @return {number} UNS record count.
    //  */
    // getRecordsCount() {
    //     return this.unsRecords.length;
    // }
    //
    // /**
    //  * Add UNS record to UNS name.
    //  *
    //  * @param {UnsRecord} record is UNS record.
    //  */
    // addUnsRecord(record) {
    //     this.unsRecords.push(record);
    // }
    //
    // /**
    //  * Get UNS record by index.
    //  *
    //  * @param {number} index.
    //  *
    //  * @return {UnsRecord}.
    //  */
    // getUnsRecord(index) {
    //     if ((index < 0) || index >= this.unsRecords.length)
    //         return null;
    //     else
    //         return this.unsRecords[index];
    // }
    //
    // /**
    //  * Find UNS record index by {@link crypto.KeyAddress}.
    //  *
    //  * @param {crypto.KeyAddress} address.
    //  *
    //  * @return {number} UNS record index (-1 if not found).
    //  */
    // findUnsRecordByAddress(address) {
    //     for (let i = 0; i < this.unsRecords.length; i++)
    //         if (this.unsRecords[i].isMatchingAddress(address))
    //             return i;
    //
    //     return -1;
    // }
    //
    // /**
    //  * Find UNS record index by {@link PublicKey}.
    //  *
    //  * @param {PublicKey} key.
    //  *
    //  * @return {number} UNS record index (-1 if not found).
    //  */
    // findUnsRecordByKey(key) {
    //     for (let i = 0; i < this.unsRecords.length; i++)
    //         if (this.unsRecords[i].isMatchingKey(key))
    //             return i;
    //
    //     return -1;
    // }
    //
    // /**
    //  * Find UNS record index by origin.
    //  *
    //  * @param {HashId} origin.
    //  *
    //  * @return {number} UNS record index (-1 if not found).
    //  */
    // findUnsRecordByOrigin(origin) {
    //     for (let i = 0; i < this.unsRecords.length; i++)
    //         if (this.unsRecords[i].isMatchingOrigin(origin))
    //             return i;
    //
    //     return -1;
    // }
    //
    // /**
    //  * Remove UNS record by index.
    //  *
    //  * @param {number} index.
    //  */
    // removeUnsRecord(index) {
    //     if ((index < 0) || index >= this.unsRecords.length)
    //         throw new ex.IllegalArgumentError("Index of removing record is outbound");
    //     else
    //         this.unsRecords.splice(index, 1);
    // }

    async serialize(serializer) {
        let data = {};

        data[UnsName.NAME_FIELD_NAME] = this.unsName;
        data[UnsName.DESCRIPTION_FIELD_NAME] = this.unsDescription;

        if (this.unsReducedName != null)
            data[UnsName.NAME_REDUCED_FIELD_NAME] = await serializer.serialize(this.unsReducedName);

        return data;
    }

    async deserialize(data, deserializer) {
        this.unsReducedName = data[UnsName.NAME_REDUCED_FIELD_NAME];
        this.unsName = data[UnsName.NAME_FIELD_NAME];
        this.unsDescription = data[UnsName.DESCRIPTION_FIELD_NAME];
    }

    equals(to) {
        if(this === to)
            return true;

        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.unsReducedName, to.unsReducedName))
            return false;

        if(!t.valuesEqual(this.unsName, to.unsName))
            return false;

        if(!t.valuesEqual(this.unsDescription, to.unsDescription))
            return false;

        return true;
    }

    equalsTo(nr) {
        return this.unsName.equals(nr.getName())
            && this.unsReducedName.equals(nr.getNameReduced())
            && this.unsDescription.equals(nr.getDescription());
    }
}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsName", UnsName));

module.exports = {UnsName};