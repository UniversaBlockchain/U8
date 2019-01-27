function BiSerializable() {
    
}

BiSerializable.prototype.deserialize = function (data, deserializer) {
    return null;
};

BiSerializable.prototype.serialize = function (data, serializer) {
    return { __type:null};
};






function BiAdapter() {

}

BiAdapter.prototype.deserialize = function (data,deserializer) {
    return null;
};


BiAdapter.prototype.serialize = function (object,serializer) {
    return {};
};

BiAdapter.prototype.getTag = function () {
    return "";
};

BiAdapter.prototype.getType = function () {
    return Object.prototype;
};

module.exports = {BiSerializable,BiAdapter};