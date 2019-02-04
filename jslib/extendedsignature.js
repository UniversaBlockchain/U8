const Boss = require("boss");
const t = require("tools");

function ExtendedSignature() {
    this.keyId = null;
    this.createdAt = null;
    this.publicKey = null;
    this.signature = null;
}

ExtendedSignature.prototype.equals = function(to) {
    if(this === to)
        return true;

    if(this.prototype !== to.prototype )
        return false;

    if(!t.valuesEqual(this.keyId,to.keyId))
        return false;

    if(!t.valuesEqual(this.createdAt,to.createdAt))
        return false;

    if(!t.valuesEqual(this.publicKey,to.publicKey))
        return false;

    if(!t.valuesEqual(this.signature,to.signature))
        return false;

    return true;
};

ExtendedSignature.sign = async function (privateKey, data, savePublicKey) {
    if(typeof savePublicKey === "undefined")
        savePublicKey = true;

    let targetSignature = ExtendedSignature.createTargetSignature(privateKey.publicKey,data,savePublicKey);

    return ExtendedSignature.of(targetSignature,
        await privateKey.sign(targetSignature, crypto.SHA512),
        await privateKey.sign(targetSignature, crypto.SHA3_256));
};

ExtendedSignature.createTargetSignature = function (publicKey, data, savePublicKey) {
    let result = {
        key: publicKey.fingerprints,
        sha512: crypto.digest(crypto.SHA512,data),
        sha3_384: crypto.digest(crypto.SHA3_384,data),
        created_at: new Date()
    };

    if (savePublicKey)
        result.pub_key = publicKey.packed;

    return Boss.dump(result);
};

ExtendedSignature.of = function (targetSignature, sign, sign2) {
    return Boss.dump({ exts: targetSignature, sign: sign, sign2: sign2});
};


ExtendedSignature.verify = async function(key, signature, data) {
    let src = Boss.load(signature);
    let es = new ExtendedSignature();
    let isSignValid = await key.verify(src.exts, src.sign, crypto.SHA512);
    let  isSign2Valid = true;
    if(src.hasOwnProperty("sign2")) {
        isSign2Valid = await key.verify(src.exts, src.sign2, crypto.SHA3_256);
    }
    if (isSignValid && isSign2Valid) {
        let b = Boss.load(src.exts);
        es.keyId = b.key;
        es.createdAt = b.created_at;
        es.signature = signature;
        if(b.hasOwnProperty("pub_key")) {
            es.publicKey = new crypto.PublicKey(b.pub_key);
        } else {
            es.publicKey = null;
        }

        let hash = b.sha512;
        let dataHash = crypto.digest(crypto.SHA512,data);
        let isHashValid = t.valuesEqual(hash,dataHash);
        let isHash2Valid = true;

        if(b.hasOwnProperty("sha3_384")) {
            let hash = b.sha3_384;
            let dataHash = crypto.digest(crypto.SHA3_384,data);
            isHash2Valid = t.valuesEqual(hash,dataHash);
        }
        if (isHashValid && isHash2Valid)
            return es;
    }
    return null;
};

ExtendedSignature.extractPublicKey = function(signature) {
    try {
        return new crypto.PublicKey(Boss.load(Boss.load(signature).exts).pub_key);
    } catch ( e) {
        return null;
    }
};

ExtendedSignature.extractKeyId = function(signature) {
    try {
        return Boss.load(Boss.load(signature).exts).key;
    } catch ( e) {
        return null;
    }
};

module.exports = {ExtendedSignature};