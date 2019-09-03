/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

crypto.SHA256 = 1;
crypto.SHA512 = 2;
crypto.SHA3_256 = 3;
crypto.SHA3_384 = 4;
crypto.SHA3_512 = 5;

crypto.Exception = class extends Error {

};

import {MemoiseMixin, PackedEqMixin, DigestEqMixin} from 'tools'

// alias for KeyAddress
const KeyAddress = crypto.KeyAddress;

KeyAddress.prototype.stringId = function () {
    if (this.stringId_ == null)
        this.stringId_ = this.toString();

    return this.stringId_;
};

/**
 * Universa private fast async key implementation (C++ bindings). Keys could be compared with `key.equals(anotherKey)`.
 *
 * @type {crypto.PrivateKey}
 */
const PrivateKey = crypto.PrivateKey = class extends crypto.PrivateKeyImpl {

    /**
     * Generate random key of a given strength.
     *
     * @param strength
     * @returns {Promise<PrivateKey>}
     */
    static async generate(strength) {
        return new Promise((resolve, reject) => {
            crypto.PrivateKey.__generate(strength, (key) => {
                key.__proto__ = crypto.PrivateKey.prototype;
                resolve(key);
            });
        });
    }

    /**
     * Construct new key from its packed binary Universa representation
     * @param {Uint8Array} packed key
     */
    constructor(packed) {
        super(packed);
    }


    /**
     * Asynchronous signature calculation.
     * @param data to sign
     * @param hashType to use to hash the data
     *
     * @returns {Promise<Uint8Array>} the calculated signature
     */
    async sign(data, hashType = crypto.SHA3_256) {
        if (typeof (data) == 'string') {
            data = utf8Encode(data);
        }
        if (data instanceof Uint8Array)
            return new Promise((resolve) => this.__sign(data, hashType, resolve));
        else
            throw new Error("Wrong data type: " + typeof (data));
    }

    /**
     * Decrypt the cipherText encrypted with {crypto.PublicKey#encrypt()}.
     *
     * @param cipherText encrypted data
     * @returns {Promise<Uint8Array>} decrypted data
     * @throws crypto.Exception if the cipherText seems to be corrupted and can not be properly decrypted
     */
    async decrypt(cipherText) {
        return new Promise( (resolve, reject) => this.__decrypt(cipherText, resolve, () =>{
            reject(new crypto.Exception("PrivateKey decryption failed"));
        }));
    }

    /**
     * Pack the key to its Universa binary representation. Caches the result.
     * @returns {Uint8Array} packed key.
     */
    get packed() {
        return this.memoise('__packed', () => this.__pack());

    }

    /**
     * Extract the public key. Caches the result.
     * @returns {crypto.PublicKey} instance
     */
    get publicKey() {
        return this.memoise("__publicKey", () => new crypto.PublicKey(this));
    }

    /**
     * Get the short Universa address of this key (actually, of its public key). Caches the result.
     * @returns {crypto.KeyAddress}
     */
    get shortAddress() {
        return this.memoise("__shortAddress", () => this.publicKey.shortAddress);
    }

    /**
     * Get the long Universa address of this key (actually, of its public key). Caches the result.
     * @returns {crypto.KeyAddress}
     */
    get longAddress() {
        return this.memoise("__longAddress", () => this.publicKey.longAddress);
    }

    /**
     * Returns bits streng (for example, 2048)
     * @returns {Number} integer number
     */
    get bitStrength() {
        return this.publicKey.bitStrength;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = "Prk:" + this.longAddress.toString();

        return this.stringId_;
    }

    toString() {
        return "Prk:" + this.longAddress.toString().slice(0, 14) + "...";
    }

};

Object.assign(crypto.PrivateKey.prototype, MemoiseMixin);
Object.assign(crypto.PrivateKey.prototype, PackedEqMixin);

const PublicKey = crypto.PublicKey = class extends crypto.PublicKeyImpl {

    constructor(...args) {
        super(...args);
        Object.assign(this, MemoiseMixin);
    }


    async verify(data, signature, hashType = crypto.SHA3_256) {
        if (typeof (data) == 'string') {
            data = utf8Encode(data);
        }
        if (data instanceof Uint8Array)
            return new Promise(resolve => this.__verify(data, signature, hashType, resolve));
        else
            throw new Error("Wrong data type: " + typeof (data));
    }

    async encrypt(plainText) {
        let data = typeof(plainText) == 'string' ? utf8Encode(plainText) : plainText;
        return new Promise( resolve => this.__encrypt(data, resolve));
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

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = "Puk:" + this.longAddress.toString();

        return this.stringId_;
    }

    toString() {
        return "Puk:" + this.longAddress.toString().slice(0, 14) + "...";
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

const SymmetricKey = crypto.SymmetricKey = class extends crypto.SymmetricKeyImpl {

    etaEncrypt(plainText) {
        return super.etaEncrypt(typeof(plainText) == 'string' ? utf8Encode(plainText) : plainText);
    }

    etaDecrypt(cipherText) {
        try {
            return super.etaDecrypt(cipherText);
        }
        catch(e) {
            throw new crypto.Exception("ETA decryption failed");
        }
    }

    get packed() {
        return this.memoise('__packed', () => this.getPacked());
    }
};

Object.assign(crypto.SymmetricKey.prototype, MemoiseMixin);
Object.assign(crypto.SymmetricKey.prototype, PackedEqMixin);


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
};

/**
 * Universa HashId implementation.
 *
 * @type {crypto.HashId}
 */
const HashId = crypto.HashId = class extends crypto.HashIdImpl {
    /**
     * Construct HashId for a given data
     *
     * @param {Uint8Array|string} data to calculate hashId of
     *
     * @returns {crypto.HashId}
     */
    static of(data) {
        return this.of_sync(data);
    }

    /**
     * Single-threaded implementation for "of"
     * @param {Uint8Array|string} data to calculate hashId of
     * @returns {crypto.HashId}
     */
    static of_sync(data) {
        if (typeof (data) == 'string')
            data = utf8Encode(data);
        return new crypto.HashId(false, data);
    }

    /**
     * Multi-threaded implementation for "of"
     * @param {Uint8Array|string} data to calculate hashId of
     * @returns {Promise<HashId>}
     */
    static of_async(data) {
        return new Promise((resolve, reject) => {
            if (typeof (data) == 'string')
                data = utf8Encode(data);
            crypto.HashIdImpl.__of(data, (res) => {
                res.__proto__ = crypto.HashId.prototype;
                resolve(res);
            });
        });
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

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.base64;

        return this.stringId_;
    }

    toString() {
        return this.base64.substring(0, 8) + "…";
    }
};

Object.assign(crypto.HashId.prototype, MemoiseMixin);
Object.assign(crypto.HashId.prototype, DigestEqMixin);

module.exports = {KeyAddress, HashId, PublicKey, PrivateKey, SymmetricKey};