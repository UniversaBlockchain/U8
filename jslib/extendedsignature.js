const Boss = require('boss.js');

function ExtendedSignature() {
    this.keyId = null;
    this.createdAt = null;
    this.publicKey = null;
    this.signature = null;
}

ExtendedSignature.sign = function (privateKey, data, savePublicKey) {
    if(typeof savePublicKey === "undefined")
        savePublicKey = true;

    let targetSignature = ExtendedSignature.createTargetSignature(privateKey.publicKey,data,savePublicKey);

    return ExtendedSignature.of(targetSignature,
        privateKey.sign(targetSignature, crypto.SHA512),
        privateKey.sign(targetSignature, crypto.SHA3_384));
};

ExtendedSignature.createTargetSignature = function (publicKey, data, savePublicKey) {
    let result = {
        key: publicKey.fingerprint(),
        sha512: new crypto.Digest(crypto.SHA512,data).digest,
        sha3_384: new crypto.Digest(crypto.SHA3_384,data).digest,
        created_at: new Date()
    };
    if (savePublicKey)
        result.put("pub_key", publicKey.packed);

    return Boss.dump(result);
};

ExtendedSignature.of = function (targetSignature, sign, sign2) {
    return Boss.dump({ exts: targetSignature, sign: sign, sign2: sign2});
};


module.exports = {ExtendedSignature};