/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

let bs = require("biserializable");


class DefaultBiMapper extends bs.BiMapper {
    constructor() {
        super();
    }

    static getInstance() {
        if(!DefaultBiMapper.instance)
            DefaultBiMapper.instance = new DefaultBiMapper();
        return DefaultBiMapper.instance;
    }

    static registerAdapter(adapter) {
        this.getInstance().registerAdapter(adapter);
    }

    static removeAdapter(adapter) {
        this.getInstance().removeAdapter(adapter);
    }

    static removeAdapterForType(type) {
        this.getInstance().removeAdapterForType(type);
    }

    static removeAdapterForTag(tag) {
        this.getInstance().removeAdapterForTag(tag);
    }
}


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
keyaddressAdapter.serialize = async function(o,s) {
    return {
        uaddress : await s.serialize(o.packed)
    };
};

keyaddressAdapter.deserialize = async function(data,d) {
    return new crypto.KeyAddress(await d.deserialize(data.uaddress));
};

DefaultBiMapper.registerAdapter(keyaddressAdapter);


let publickeyAdapter = new bs.BiAdapter("RSAPublicKey",crypto.PublicKey);
publickeyAdapter.serialize = async function(o,s) {
    return {
        packed : await s.serialize(o.packed)
    };
};

publickeyAdapter.deserialize = async function(data,d) {
    return new crypto.PublicKey(await d.deserialize(data.packed));
};

DefaultBiMapper.registerAdapter(publickeyAdapter);



let privatekeyAdapter = new bs.BiAdapter("RSAPrivateKey",crypto.PrivateKey);
privatekeyAdapter.serialize = async function(o,s) {
    return {
        packed : await s.serialize(o.packed)
    };
};

privatekeyAdapter.deserialize = async function(data,d) {
    return new crypto.PrivateKey(await d.deserialize(data.packed));
};

DefaultBiMapper.registerAdapter(privatekeyAdapter);


let hashidAdapter = new bs.BiAdapter("HashId",crypto.HashId);
hashidAdapter.serialize = async function(o,s) {
    return {
        composite3 : await s.serialize(o.digest)
    };
};

hashidAdapter.deserialize = async function(data,d) {
    return crypto.HashId.withDigest(await d.deserialize(data.composite3));
};

DefaultBiMapper.registerAdapter(hashidAdapter);


module.exports = {DefaultBiMapper};