const hash = require('hash.js');
const elliptic = require("elliptic.js");
const secp256k1 = new (elliptic.ec)("secp256k1");

const randomBytes = count => {
    let r = [];
    for (let i = 0; i < count; i++)
        r.push(Math.floor(Math.random() * 256));
    return new Uint8Array(r);
};

const hexToBytes = hex => {
    let r = [];
    for (let i = 2, l = hex.length; i < l; i += 2)
        r.push(parseInt(hex.slice(i, i + 2), 16));
    return new Uint8Array(r);
};

const concat = (a, b) => {
    let r = new Uint8Array(a.length + b.length);
    r.set(a, 0);
    r.set(b, a.length);
    return r;
};

const toChecksum = address => {
    const addressHash = hash.keccak256s(address.slice(2));
    let checksumAddress = "0x";
    for (let i = 0; i < 40; i++)
        checksumAddress += parseInt(addressHash[i + 2], 16) > 7
            ? address[i + 2].toUpperCase()
            : address[i + 2];
    return checksumAddress;
};

const fromPrivate = privateKey => {
    const ecKey = secp256k1.keyFromPrivate(privateKey);
    const publicKey = "0x" + ecKey.getPublic(false, 'hex').slice(2);
    const publicHash = hash.keccak256(publicKey);
    const address = toChecksum("0x" + publicHash.slice(-40));
    return {
        address: address,
        privateKey: privateKey
    }
};

function createWallet() {
    const innerHex = hexToBytes(hash.keccak256(randomBytes(64)));
    const outerHex = hexToBytes(hash.keccak256(concat(concat(randomBytes(32), innerHex), randomBytes(32))));
    return fromPrivate(outerHex);
    // const outerHex = hash.keccak256(concat(concat(randomBytes(32), innerHex), randomBytes(32)));
    // let x = fromPrivate(hexToBytes(outerHex));
    // x.privateKey = outerHex;
    // return x;
}

function createTransaction() {

}

module.exports = {createWallet, createTransaction};