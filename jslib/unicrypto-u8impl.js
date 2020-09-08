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

        pack(onComplete) {
            onComplete(this.impl_.packed);
        }

        sign(data, pssHashType, mgf1HashType, saltLen, onComplete) {
            this.impl_.__signEx(data, pssHashType, mgf1HashType, saltLen, onComplete);
        }

        // signWithCustomSalt(data, pssHashType, mgf1HashType, salt, onComplete) {
        //     this.impl_.__signExWithCustomSalt(data, pssHashType, mgf1HashType, salt, onComplete);
        // }

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
};

class TextDecoder {
    constructor() {}
    decode(bytes) {return utf8Decode(bytes);}
}

module.exports = {Module, TextDecoder};