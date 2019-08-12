const Boss = require("boss");
const t = require("tools");

class ExtendedSignature {
    constructor() {
        this.keyId = null;
        this.createdAt = null;
        this.publicKey = null;
        this.signature = null;
    }

    equals(to) {
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
    }

    static async sign(privateKey, data, savePublicKey) {
        if(typeof savePublicKey === "undefined")
            savePublicKey = true;

        let targetSignature = await ExtendedSignature.createTargetSignature(privateKey.publicKey,data,savePublicKey);

        return await ExtendedSignature.of(targetSignature,
            await privateKey.sign(targetSignature, crypto.SHA512),
            await privateKey.sign(targetSignature, crypto.SHA3_384));
    }

    static async createTargetSignature(publicKey, data, savePublicKey) {
        let result = {
            key: publicKey.fingerprints,
            sha512: crypto.digest(crypto.SHA512,data),
            sha3_384: crypto.digest(crypto.SHA3_384,data),
            created_at: new Date()
        };

        if (savePublicKey)
            result.pub_key = publicKey.packed;

        return await Boss.dump(result);
    }

    static async of(targetSignature, sign, sign3) {
        return await Boss.dump({ exts: targetSignature, sign: sign, sign3: sign3});
    }

    static async verify(key, signature, data) {
        //return this.jsVerify(key, signature, data);
        return this.cppVerify(key, signature, data);
    }

    static async jsVerify(key, signature, data) {
        let src = await Boss.load(signature);
        let es = new ExtendedSignature();
        let isSignValid = await key.verify(src.exts, src.sign, crypto.SHA512);
        let  isSign2Valid = true;
        if(src.hasOwnProperty("sign2")) {
            isSign2Valid = await key.verify(src.exts, src.sign2, crypto.SHA3_256);
        }

        let  isSign3Valid = true;
        if(src.hasOwnProperty("sign3")) {
            isSign3Valid = await key.verify(src.exts, src.sign3, crypto.SHA3_384);
        }

        if (isSignValid && isSign2Valid && isSign3Valid) {
            let b = await Boss.load(src.exts);
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
    }

    static async cppVerify(key, signature, data) {
        return new Promise(resolve => __verify_extendedSignature(key, signature, data, (res) => {
            if (res != null)
                res.__proto__ = ExtendedSignature.prototype;
            resolve(res);
        }));
    }

    static async extractPublicKey(signature) {
        try {
            return new crypto.PublicKey((await Boss.load((await Boss.load(signature)).exts)).pub_key);
        } catch ( e) {
            return null;
        }
    }

    static async extractKeyId(signature) {
        try {
            return (await Boss.load((await Boss.load(signature)).exts)).key;
        } catch ( e) {
            return null;
        }
    }
}


module.exports = {ExtendedSignature};