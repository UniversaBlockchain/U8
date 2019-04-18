const NameRecord = require("services/nameRecord").NameRecord;
const NNameRecordEntry = require("services/NNameRecordEntry").NNameRecordEntry;

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
            this.entries = new Set(entries);
        else {
            this.entries = new Set();

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
        return new Set(this.entries);
    }

    deserialize(data, deserializer) {
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

        this.expiresAt = deserializer.deserialize(data.expiresAt);

        this.entries = new Set(deserializer.deserialize(data.entries));
    }

    serialize(serializer) {
        return {
            name : serializer.serialize(this.name),
            nameReduced : serializer.serialize(this.nameReduced),
            description : serializer.serialize(this.description),
            url : serializer.serialize(this.url),
            expiresAt : serializer.serialize(this.expiresAt),
            entries : serializer.serialize(Array.from(this.entries))
        };
    }
}

module.exports = {NNameRecord};