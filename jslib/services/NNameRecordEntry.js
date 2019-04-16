const bs = require("biserializable");

/**
 * Implements {@see NameRecordEntry} interface for UNS contract.
 */
class NNameRecordEntry extends NameRecordEntry, bs.BiSerializable {

    constructor(origin, shortAddress, longAddress) {
        super();
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

    deserialize(data, deserializer) {
        try {
            this.origin = deserializer.deserialize(data.origin);
        } catch (e) {
            this.origin = null;
        }

        if (data.hasOwnProperty("shortAddress"))
            this.shortAddress = data.shortAddress;
        else
            this.shortAddress = null;

        if (data.hasOwnProperty("longAddress"))
            this.longAddress = data.longAddress;
        else
            this.longAddress = null;
    }

    serialize(serializer) {
        return {
            origin : serializer.serialize(this.origin),
            shortAddress : serializer.serialize(this.shortAddress),
            longAddress : serializer.serialize(this.longAddress)
        };
    }
}