let Module = {
    PrivateKeyImpl: class PrivateKeyImpl {
        constructor(packedUint8array = null) {
            if (packedUint8array != null)
                this.impl_ = new crypto.PrivateKey(packedUint8array);
        }

        delete() {
            // do nothing
        }

        static generate(strength, onComplete) {
            crypto.PrivateKey.generate(strength).then(key => {
                let res = new Module.PrivateKeyImpl();
                res.impl_ = key;
                onComplete(res);
            });
        }

        static unpackWithPassword(packedBinary, passwordString, onComplete) {
            crypto.PrivateKey.__unpackWithPassword(packedBinary, passwordString, (err, key) => {
                if (err === "") {
                    let res = new Module.PrivateKeyImpl();
                    res.impl_ = key;
                    onComplete("", res);
                } else {
                    console.log("err: " + err);
                    onComplete(err);
                }
            });
        }

        pack(onComplete) {
            onComplete(this.impl_.packed);
        }

        packWithPassword(passwordString, rounds, onComplete) {
            onComplete("", this.impl_.__packWithPassword(passwordString, rounds));
        }

        sign(data, pssHashType, mgf1HashType, saltLen, onComplete) {
            if (typeof (data) == 'string')
                data = utf8Encode(data);
            this.impl_.__signEx(data, pssHashType, mgf1HashType, saltLen, onComplete);
        }

        signWithCustomSalt(data, pssHashType, mgf1HashType, salt, onComplete) {
            if (typeof (data) == 'string')
                data = utf8Encode(data);
            this.impl_.__signExWithCustomSalt(data, pssHashType, mgf1HashType, salt, onComplete);
        }

        decrypt(data, oaepHash, onComplete) {
            this.impl_.__decryptEx(data, oaepHash, result => {
                onComplete(result);
            }, errorText => {
                throw new Error("unicrypto-u8impl PrivateKeyImpl decrypt error: " + errorText);
            });
        }

        get_e() {
            return this.impl_.__get_e();
        }

        get_p() {
            return this.impl_.__get_p();
        }

        get_q() {
            return this.impl_.__get_q();
        }
    },

    PublicKeyImpl: class PublicKeyImpl {
        constructor(privateKey = null) {
            if (privateKey != null)
                this.impl_ = new crypto.PublicKey(privateKey.impl_);
        }

        delete() {
            // do nothing
        }

        static initFromPackedBinary(packedBinary, onComplete) {
            let res = new Module.PublicKeyImpl();
            res.impl_ = new crypto.PublicKey(packedBinary);
            onComplete(res);
        }

        verify(data, signature, pssHashType, mgf1HashType, saltLen, onComplete) {
            if (typeof (data) == 'string')
                data = utf8Encode(data);
            this.impl_.__verifyEx(data, signature, pssHashType, mgf1HashType, saltLen, onComplete);
        }

        encrypt(data, oaepHash, onComplete) {
            this.impl_.__encryptEx(data, oaepHash, onComplete);
        }

        encryptWithSeed(data, oaepHash, seed, onComplete) {
            this.impl_.__encryptExWithSeed(data, oaepHash, seed, onComplete);
        }

        getBitStrength() {
            return this.impl_.bitStrength;
        }

        fingerprint(onComplete) {
            onComplete(this.impl_.fingerprints);
        }

        pack(onComplete) {
            onComplete(this.impl_.packed);
        }

        get_e() {
            return this.impl_.__get_e();
        }

        get_n() {
            return this.impl_.__get_n();
        }

        getShortAddress58() {
            return this.impl_.shortAddress.toString();
        }

        getLongAddress58() {
            return this.impl_.longAddress.toString();
        }

        getShortAddressBin(onComplete) {
            onComplete(this.impl_.shortAddress.getPacked());
        }

        getLongAddressBin(onComplete) {
            onComplete(this.impl_.longAddress.getPacked());
        }
    },

    calcHashId: (binaryToHash, onComplete) => {
        onComplete(crypto.HashId.of(binaryToHash).digest);
    },

    DigestImpl: class DigestImpl extends crypto.DigestImpl {
        constructor(hashType) {
            super(hashType);
        }
        delete() {
            // do nothing
        }
        getDigest(onComplete) {
            onComplete(super.getDigest());
        }
        update(data) {
            if (typeof (data) == 'string')
                data = utf8Encode(data);
            return super.update(data);
        }
    },

    calcHmac: (hashType, keyBinary, dataBinary, onComplete) => {
        onComplete(crypto.__calcHmac(hashType, keyBinary, dataBinary));
    },

    pbkdf2: (hashType, rounds, keyLength, password, salt, onComplete) => {
        onComplete(crypto.__pbkdf2(hashType, rounds, keyLength, password, salt));
    },
};

class TextDecoder {
    constructor() {}
    decode(bytes) {return utf8Decode(bytes);}
}

class TextEncoder {
    constructor() {}
    encode(text) {return utf8Encode(text);}
}

function freezeUnicrypto() {
    if (typeof Base58 !== 'undefined') {
        Object.freeze(Base58.encode);
        Object.freeze(Base58.decode);
        Object.freeze(Base58);
    }
}

module.exports = {Module, TextDecoder, TextEncoder, freezeUnicrypto};