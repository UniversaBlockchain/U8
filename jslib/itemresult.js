const bs = require("biserializable");
const dbm = require("defaultbimapper");
const t = require("tools");


class ItemResult {
    constructor() {
        this.state = null;
        this.haveCopy = null;
        this.createdAt = null;
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
            writer.write(this.createdAt);
        else
            writer.write(0);

        if(this.expiresAt != null)
            writer.write(this.expiresAt);
        else
            writer.write(0);

        writer.write(this.haveCopy);
    }

    equals(to) {
        if(this === to)
            return true;


        if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
            return false;

        if(!t.valuesEqual(this.state,to.state))
            return false

        if(!t.valuesEqual(this.haveCopy,to.haveCopy))
            return false

        if(!t.valuesEqual(this.isTestnet,to.isTestnet))
            return false

        if(!t.valuesEqual(this.createdAt,to.createdAt))
            return false

        if(!t.valuesEqual(this.expiresAt,to.expiresAt))
            return false

        return true;
    }

    toString() {
        return "ItemResult<" + this.state.val + " " + createdAt + " (" + (this.haveCopy ? "copy" : "") + ")" + this.errors +
            ">";
    }

    static from(state, haveCopy, createdAt, expiresAt) {
        this.state = state;
        this.haveCopy = haveCopy;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    static fromStateRecord(record, haveCopy) {
        if(typeof haveCopy === "undefined") {
            haveCopy = false;
        }

        return new ItemResult(record.state,haveCopy,record.createdAt,record.updatedAt);
    }

    static fromReader(reader) {
        let ir = new ItemResult();
        ir.state = ItemState.byOrdinal.get(reader.read())

        ir.createdAt = new Date(reader.read());//ZonedDateTime.ofInstant(Instant.ofEpochSecond(br.readLong()), ZoneId.systemDefault());
        ir.expiresAt = new Date(reader.read());//ZonedDateTime.ofInstant(Instant.ofEpochSecond(br.readLong()), ZoneId.systemDefault());

        ir.haveCopy = reader.read();
        return ir;
    }
}

dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("ItemResult", ItemResult));

module.exports = {ItemResult};