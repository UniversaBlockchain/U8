

crypto.SHA256 = 1;
crypto.SHA512 = 2;
crypto.SHA3_256 = 3;
crypto.SHA3_384 = 4;
crypto.SHA3_512 = 5;


import {MemoiseMixin, PackedEqMixin} from 'tools'

crypto.PrivateKey = class extends crypto.PrivateKeyImpl {

    constructor(...args) {
        super(...args);
    }


    sign(data, hashType = crypto.SHA3_256) {
        if (typeof (data) == 'string') {
            data = utf8Encode(data);
        }
        if (data instanceof Uint8Array)
            return this.__sign(data, hashType);
        else
            throw new Error("Wrong data type: " + typeof (data));
    }

    get packed() {
        // if( !this.__packed) this.__packed = this.__pack();
        // return this.__packed;
        return this.memoise('__packed', () => this.__pack());

    }

    get publicKey() {
        return this.memoise("__publicKey", () => new crypto.PublicKey(this) );
    }

    get shortAddress() {
        return this.memoise("__shortAddress", () => this.publicKey.shortAddress);
    }

    get longAddress() {
        return this.memoise("__longAddress", () => this.publicKey.longAddress);
    }

    get bitStrength() {
        return this.publicKey.bitStrength;
    }

    toString() {
        return "Prk:"+this.longAddress.toString().slice(0,14)+"...";
    }

};

Object.assign(crypto.PrivateKey.prototype, MemoiseMixin);
Object.assign(crypto.PrivateKey.prototype, PackedEqMixin);

crypto.PublicKey = class extends crypto.PublicKeyImpl {

    constructor(...args) {
        super(...args);
        Object.assign(this, MemoiseMixin);
    }


    verify(data, signature, hashType = crypto.SHA3_256) {
        if (typeof (data) == 'string') {
            data = utf8Encode(data);
        }
        if (data instanceof Uint8Array)
            return this.__verify(data, signature, hashType);
        else
            throw new Error("Wrong data type: " + typeof (data));
    }

    get packed() {
        return this.memoise('__packed', () => this.__pack());
    }

    get shortAddress() {
        return this.memoise('__shortAddress', () => new crypto.KeyAddress(this, 0, false));
    }

    get longAddress() {
        return this.memoise('__longAddress', () => new crypto.KeyAddress(this, 0, true));
    }

    get fingerprints() {
        return this.memoise('__fingerprints', () => this.__getFingerprints());
    }

    get bitStrength() {
        return this.memoise("__bits", () => this.__getBitsStrength())
    }

    toString() {
        return "Puk:"+this.longAddress.toString().slice(0,14)+"...";
    }
};

Object.assign(crypto.PublicKey.prototype, MemoiseMixin);
Object.assign(crypto.PublicKey.prototype, PackedEqMixin);

Object.defineProperty(crypto.KeyAddress.prototype, "packed", {
    get: function () {
        return this.memoise('__packed', () => this.getPacked());
    }
});

Object.assign(crypto.KeyAddress.prototype, MemoiseMixin);
Object.assign(crypto.KeyAddress.prototype, PackedEqMixin);

/**
 * Calculate digest of a string or binary data (Uint8Array). UTF8 encoding is used if a string is given.
 *
 * @param type any of crypto.SHA* constants
 * @param {string | Uint8Array} data
 * @returns {Uint8Array} binary digest
 */
crypto.digest = (hashType, data) => {
    if (typeof (data) == 'string')
        data = utf8Encode(data);
    return crypto.__digest(hashType, data);
}

/**
 * Universa HashId implementation.
 *
 * @type {crypto.HashId}
 */
crypto.HashId = class extends crypto.HashIdImpl {
    /**
     * Construct HashId for a given data
     *
     * @param {Uint8Array|string} data to calculate hashId of
     *
     * @returns {crypto.HashId}
     */
    static of(data) {
        if (typeof (data) == 'string')
            data = utf8Encode(data);
        return new crypto.HashId(false, data);
    }

    /**
     * Construct HashId with pre-calculated digest.
     *
     * @param {Uint8Array} digest
     * @returns {crypto.HashId}
     */
    static withDigest(digest) {
        return new crypto.HashId(true, digest);
    }

    /**
     * Construct HashId with pre-calculated digest in base64 encoded form
     * @param {string} digest in base64 encoding
     * @returns {crypto.HashId}
     */
    static withBase64Digest(digest) {
        return new crypto.HashId(true, atob(digest));
    }

    /**
     * Get the digest as binary array
     * @returns {Uint8Array}
     */
    get digest() {
        return this.memoise("__digest", () => this.__getDigest());
    }

    /**
     * Get the digest as base64-encoded string
     * @returns {string} base64 encoded digest
     */
    get base64() {
        return this.memoise("__base64", () => this.__getBase64String());
    }

    /**
     * Check that this HashId is equal to another hashId.
     * @param anotherId anything that imlements {digest} getter.
     * @returns {boolean}
     */
    equals(anotherId) {
        return equalArrays(this.digest, anotherId.digest);
    }
};

Object.assign(crypto.HashId.prototype, MemoiseMixin);
Object.assign(crypto.HashId.prototype, PackedEqMixin);

module.exports = crypto;