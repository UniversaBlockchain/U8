let bs = require("biserializable");


function DefaultBiMapper() {
    bs.BiMapper.call(this);
}

DefaultBiMapper.prototype = Object.create(bs.BiMapper.prototype);

DefaultBiMapper.getInstance = function () {
    if(!DefaultBiMapper.instance)
        DefaultBiMapper.instance = new DefaultBiMapper();
    return DefaultBiMapper.instance;
};

DefaultBiMapper.registerAdapter = function (adapter) {
    this.getInstance().registerAdapter(adapter);
};

DefaultBiMapper.removeAdapter = function (adapter) {
    this.getInstance().removeAdapter(adapter);
};

DefaultBiMapper.removeAdapterForType = function (type) {
    this.getInstance().removeAdapterForType(type);
};

DefaultBiMapper.removeAdapterForTag = function (tag) {
    this.getInstance().removeAdapterForTag(tag);
};


let binaryAdapter = new bs.BiAdapter("binary",Uint8Array);
binaryAdapter.serialize = function(o,s) {
    return {base64: btoa(o)};
};

binaryAdapter.deserialize = function(data,d) {
    return atob(data.base64);
};

DefaultBiMapper.registerAdapter(binaryAdapter);

let datetimeAdapter = new bs.BiAdapter("unixtime",Date);
datetimeAdapter.serialize = function(o,s) {
    return {
        seconds : Math.floor(o.getTime()/1000)
    };
};

datetimeAdapter.deserialize = function(data,d) {
    let res = new Date();
    res.setTime(data.seconds*1000);
    return res;
};

DefaultBiMapper.registerAdapter(datetimeAdapter);



let keyaddressAdapter = new bs.BiAdapter("KeyAddress",crypto.KeyAddress);
keyaddressAdapter.serialize = function(o,s) {
    return {
        uaddress : s.serialize(o.packed)
    };
};

keyaddressAdapter.deserialize = function(data,d) {
    return new crypto.KeyAddress(d.deserialize(data.uaddress));
};

DefaultBiMapper.registerAdapter(keyaddressAdapter);


let publickeyAdapter = new bs.BiAdapter("RSAPublicKey",crypto.PublicKey);
publickeyAdapter.serialize = function(o,s) {
    return {
        packed : s.serialize(o.packed)
    };
};

publickeyAdapter.deserialize = function(data,d) {
    return new crypto.PublicKey(d.deserialize(data.packed));
};

DefaultBiMapper.registerAdapter(publickeyAdapter);



let privatekeyAdapter = new bs.BiAdapter("RSAPrivateKey",crypto.PrivateKey);
privatekeyAdapter.serialize = function(o,s) {
    return {
        packed : s.serialize(o.packed)
    };
};

privatekeyAdapter.deserialize = function(data,d) {
    return new crypto.PrivateKey(d.deserialize(data.packed));
};

DefaultBiMapper.registerAdapter(privatekeyAdapter);


let hashidAdapter = new bs.BiAdapter("HashId",crypto.HashId);
hashidAdapter.serialize = function(o,s) {
    return {
        composite3 : s.serialize(o.digest)
    };
};

hashidAdapter.deserialize = function(data,d) {
    return crypto.HashId.withDigest(d.deserialize(data.composite3));
};

DefaultBiMapper.registerAdapter(hashidAdapter);


module.exports = {DefaultBiMapper};