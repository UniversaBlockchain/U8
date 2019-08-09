const NameRecordEntry = require("services/nameRecordEntry").NameRecordEntry;
const t = require("tools");

/**
 * Implements {@see NameRecordEntry} interface for UNS contract.
 */
class NNameRecordEntry extends NameRecordEntry {

    constructor(origin, shortAddress, longAddress) {
        super();
        this.id = 0;
        this.nameRecordId = 0;
        this.origin = origin;
        this.longAddress = longAddress;
        this.shortAddress = shortAddress;
    }

    getLongAddress() {
        return this.longAddress;
    }

    getShortAddress() {
        return this.shortAddress;
    }

    getOrigin() {
        return this.origin;
    }

    async deserialize(data, deserializer) {
        try {
            this.origin = await deserializer.deserialize(data.origin);
        } catch (e) {
            this.origin = null;
        }

        if (data.hasOwnProperty("shortAddress"))
            this.shortAddress = await deserializer.deserialize(data.shortAddress);
        else
            this.shortAddress = null;

        if (data.hasOwnProperty("longAddress"))
            this.longAddress = await deserializer.deserialize(data.longAddress);
        else
            this.longAddress = null;
    }

    async serialize(serializer) {
        return {
            origin : await serializer.serialize(this.origin),
            shortAddress : await serializer.serialize(this.shortAddress),
            longAddress : await serializer.serialize(this.longAddress)
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

module.exports = {NNameRecordEntry};