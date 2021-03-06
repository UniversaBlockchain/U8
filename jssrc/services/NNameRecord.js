/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const NameRecord = require("services/nameRecord").NameRecord;
const NNameRecordEntry = require("services/NNameRecordEntry").NNameRecordEntry;
const t = require("tools");

/**
 * Implements {@see NameRecord} interface for UNS contract.
 */
class NNameRecord extends NameRecord {

    constructor(unsName, expiresAt, entries, id, environmentId) {
        super();

        this.name = unsName.unsName;
        this.nameReduced = unsName.unsReducedName;
        this.description = unsName.unsDescription;
        this.url = unsName.unsURL;
        this.expiresAt = expiresAt;

        if (entries !== undefined)
            this.entries = new t.GenericSet(entries);
        else {
            this.entries = new t.GenericSet();

            unsName.unsRecords.forEach(unsRecord => {
                let longAddress = null;
                let shortAddress = null;
                for (let keyAddress of unsRecord.unsAddresses) {
                    let address = keyAddress.toString();
                    //Packed to string the long address takes 72 characters
                    if (address.length === 72)
                        longAddress = address;
                    else
                        shortAddress = address;
                }
                this.entries.add(new NNameRecordEntry(unsRecord.unsOrigin, shortAddress, longAddress));
            });
        }

        if (id !== undefined)
            this.id = id;
        else
            this.id = 0;

        if (environmentId !== undefined)
            this.environmentId = environmentId;
        else
            this.environmentId = 0;
    }

    getExpiresAt() {
        return this.expiresAt;
    }

    getName() {
        return this.name;
    }

    getNameReduced() {
        return this.nameReduced;
    }

    getDescription() {
        return this.description;
    }

    getUrl() {
        return this.url;
    }

    getEntries() {
        return new t.GenericSet(this.entries);
    }

    async deserialize(data, deserializer) {
        this.name = data.name;
        this.nameReduced = data.nameReduced;

        if (data.hasOwnProperty("description"))
            this.description = data.description;
        else
            this.description = null;

        if (data.hasOwnProperty("url"))
            this.url = data.url;
        else
            this.url = null;

        this.expiresAt = await deserializer.deserialize(data.expiresAt);

        this.entries = new t.GenericSet(await deserializer.deserialize(data.entries));
    }

    async serialize(serializer) {
        return {
            name : await serializer.serialize(this.name),
            nameReduced : await serializer.serialize(this.nameReduced),
            description : await serializer.serialize(this.description),
            url : await serializer.serialize(this.url),
            expiresAt : await serializer.serialize(this.expiresAt),
            entries : await serializer.serialize(Array.from(this.entries))
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

module.exports = {NNameRecord};