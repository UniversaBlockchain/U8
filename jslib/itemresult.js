const bs = require("biserializable");
const dbm = require("defaultbimapper");
const t = require("tools");
const ItemState = require("itemstate").ItemState;

/**
 * The exported state of the item. This object is used to return data for the external (e.g. network) queries. We do not
 * expose local data in direct mode. It is a "structure" of final members, to simplify access and avoid getters.
 */
class ItemResult {
    static DISCARDED = new ItemResult(ItemState.DISCARDED, false, null, null);
    static UNDEFINED = new ItemResult(ItemState.UNDEFINED, false, null, null);

    constructor() {
        /**
         * The current state of the item in question.
         */
        this.state = null;
        /**
         * True if the node has the copy of approvable item at the moment. Note that the node will discard its copy as soon
         * as the consensus of any sort will be found, or the election will fail (timeout, no quorum, etc).
         */
        this.haveCopy = null;
        /**
         * Time when the item was created on the node. It will be slightly different accross the network.
         */
        this.createdAt = null;
        /**
         * Current expiration time. It could be changed if the state is not final. Expired items are discarded by the
         * network.
         */
        this.expiresAt = null;
        this.errors = null;
        this.isTestnet = null;
        this.lockedById = null;
        this.extraDataBinder = null;
    }

    deserialize(data, deserializer) {
        this.state = ItemState.byVal.get(data.state);
        this.haveCopy = data.haveCopy;

        if(data.hasOwnProperty("createdAt")) {
            this.createdAt = deserializer.deserialize(data.createdAt);
        } else {
            this.createdAt = null;
        }

        if(data.hasOwnProperty("expiresAt")) {
            this.expiresAt = deserializer.deserialize(data.expiresAt);
        } else {
            this.expiresAt = null;
        }

        if(data.hasOwnProperty("errors")) {
            this.errors = deserializer.deserialize(data.errors);
        } else {
            this.errors = [];
        }

        if(data.hasOwnProperty("isTestnet")) {
            this.isTestnet = data.isTestnet;
        } else {
            this.isTestnet = false;
        }

        if(data.hasOwnProperty("lockedById")) {
            this.lockedById = deserializer.deserialize(data.lockedById);
        } else {
            this.lockedById = null;
        }

        if(data.hasOwnProperty("extra")) {
            this.extra = deserializer.deserialize(data.extra);
        } else {
            this.extra = {};
        }
    }

    serialize(serializer) {
        return {
            state:this.state.val,
            createdAt:serializer.serialize(this.createdAt),
            expiresAt:serializer.serialize(this.expiresAt),
            errors:serializer.serialize(this.errors),
            isTestnet:this.isTestnet,
            lockedById:serializer.serialize(this.lockedById),
            extra:serializer.serialize(this.extra)
        }
    }

    writeTo(writer) {
        writer.write(this.state.ordinal);
        if(this.createdAt != null)
            writer.write(Math.floor(this.createdAt.getTime() / 1000));
        else
            writer.write(0);

        if(this.expiresAt != null)
            writer.write(Math.floor(this.expiresAt.getTime() / 1000));
        else
            writer.write(0);

        writer.write(this.haveCopy);
    }

    /**
     * The equivalence is not absolutely exact. As serializing and deserializing often looses seconds fration, it
     * compares {@link #expiresAt} and {@link #createdAt} only truncated to seconds. So, if comarison with maximum
     * precision is of essence, compare these fields separately.
     *
     * @param {Object} to - Presumably another {@link ItemResult} instance.
     * @return {boolean} true if instances represent the same state with datetimes fields equal to seconds.
     */
    equals(to) {
        if (this === to)
            return true;

        if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if (!t.valuesEqual(this.state, to.state))
            return false;

        if (!t.valuesEqual(this.haveCopy, to.haveCopy))
            return false;

        if (!t.valuesEqual(this.isTestnet, to.isTestnet))
            return false;

        if (!t.valuesEqual(Math.floor(this.createdAt.getTime() / 1000), Math.floor(to.createdAt.getTime() / 1000)))
            return false;

        if (!t.valuesEqual(Math.floor(this.expiresAt.getTime() / 1000), Math.floor(to.expiresAt.getTime() / 1000)))
            return false;

        return true;
    }

    toString() {
        return "ItemResult<" + this.state.val + " " + this.createdAt + " (" + (this.haveCopy ? "copy" : "") + ")" +
            this.errors + ">";
    }

    /**
     * Create an ItemResult with specific fields.
     *
     * @param {ItemState} state The current state of the item in question.
     * @param {boolean} haveCopy - True if the node has the copy of approvable item.
     * @param {Date} createdAt Time when the item was created on the node.
     * @param {Date} expiresAt Current expiration time.
     * @return {ItemResult} created with specific fields.
     */
    static from(state, haveCopy, createdAt, expiresAt) {
        let result = new ItemResult();

        result.state = state;
        result.haveCopy = haveCopy;
        result.createdAt = createdAt;
        result.expiresAt = expiresAt;

        return result;
    }

    /**
     * Create an ItemResult from a record and possession flag.
     *
     * @param {StateRecord} record - Record to get data from.
     * @param {boolean} haveCopy=false - True if the node has a copy of the approvable item.
     * @return {ItemResult} - created from StateRecord.
     */
    static fromStateRecord(record, haveCopy = false) {
        let result = new ItemResult();

        result.state = record.state;
        result.haveCopy = haveCopy;
        result.createdAt = record.createdAt;
        result.expiresAt = record.expiresAt;

        return result;
    }

    static fromReader(reader) {
        let ir = new ItemResult();
        ir.state = ItemState.byOrdinal.get(reader.read());

        ir.createdAt = new Date(reader.read() * 1000);
        ir.expiresAt = new Date(reader.read() * 1000);

        ir.haveCopy = reader.read();
        return ir;
    }
}

dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ItemResult", ItemResult));

module.exports = {ItemResult};