let bs = require("biserializable");
let dbm = require("defaultbimapper");
let t = require("tools");

///////////////////////////
//KeyRecord
///////////////////////////

function KeyRecord(key) {
    this.key = key;
}

KeyRecord.prototype = Object.create(bs.BiSerializable.prototype);



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