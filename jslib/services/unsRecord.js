const bs = require("biserializable");
const ex = require("exceptions");

class UnsRecord extends bs.BiSerializable {

    static ADDRESSES_FIELD_NAME = "addresses";
    static ORIGIN_FIELD_NAME = "origin";

    constructor() {
        super();
        this.unsAddresses = [];
        this.unsOrigin = null;
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
     * Method calls from {@link UnsContract#fromDslFile(String)} and initialize UNS record from given root object.
     *
     * @param {Object} root object with initialized data.
     *
     * @return {UnsRecord} created and ready {@link UnsRecord}.
     */
    initializeWithDsl(root) {
        if (root[UnsRecord.ORIGIN_FIELD_NAME] != null)
            this.unsOrigin = crypto.HashId.withDigest(root[UnsRecord.ORIGIN_FIELD_NAME]);
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

        return data;
    }

    async deserialize(data, deserializer) {
        if (data.hasOwnProperty("addresses"))
            this.unsAddresses = await deserializer.deserialize(data.addresses);

        if (data.hasOwnProperty("origin"))
            this.unsOrigin = await deserializer.deserialize(data.origin);
    }
}

DefaultBiMapper.registerAdapter(new bs.BiAdapter("UnsRecord", UnsRecord));

module.exports = {UnsRecord};