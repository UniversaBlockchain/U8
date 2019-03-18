let bs = require("biserializable");
let dbm = require("defaultbimapper");
let t = require("tools");
const ex = require("exceptions");

///////////////////////////
//KeyRecord
///////////////////////////

function KeyRecord(key) {
    this.key = key;
}

KeyRecord.fromDsl = function (serializedKeyRecord) {
    if(!serializedKeyRecord.hasOwnProperty("key"))
        throw new ex.IllegalArgumentError("Undefined key required for init KeyRecord");

    let result = new KeyRecord(serializedKeyRecord.key);

    for (let field in serializedKeyRecord)
        if (serializedKeyRecord.hasOwnProperty(field))
            result[field] = serializedKeyRecord[field];

    result.setupKey();

    return result;
};

KeyRecord.prototype = Object.create(bs.BiSerializable.prototype);

KeyRecord.prototype.setupKey = function() {
    try {
        if (this.key instanceof crypto.PublicKey)
            return;
        else if (this.key instanceof crypto.PrivateKey)
            this.key = this.key.publicKey;
        else if (typeof this.key === "string")
            this.key = new crypto.PublicKey(atob(this.key.replace(/\s/g, "")));
        else {
            if (this.key instanceof Array)
                this.key = new crypto.PublicKey(this.key);
            else
                throw new ex.IllegalArgumentError("unsupported key object: " + JSON.stringify(this.key));
        }
    } catch (e) {
        throw new ex.IllegalArgumentError("unsupported key, failed to construct", e);
    }
};

KeyRecord.prototype.deserialize = function (data, deserializer) {
    this.key = deserializer.deserialize(data.key);
};

KeyRecord.prototype.serialize = function(serializer) {
    return {key:serializer.serialize(this.key)};
};

KeyRecord.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(Object.getPrototypeOf(this) !== Object.getPrototypeOf(to))
        return false;

    return t.valuesEqual(this.key,to.key);
};

dbm.DefaultBiMapper.registerAdapter(new bs.BiAdapter("KeyRecord",KeyRecord));

///////////////////////////
//EXPORTS
///////////////////////////
module.exports = {KeyRecord};