const hash = require('hash.js');
const rlp = require('rlp.js');
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

const fromNumber = num => {
    let hex = num.toString(16);
    return hex.length % 2 === 0 ? "0x" + hex : "0x0" + hex ;
};

const toNumber = hex =>
    parseInt(hex.slice(2), 16);

const fromNat = bn =>
    bn === "0x0" ? "0x" : bn.length % 2 === 0 ? bn : "0x0" + bn.slice(2);

const toNat = bn =>
    bn[2] === "0" ? "0x" + bn.slice(3) : bn;

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

function createTransaction(nonce, gasPrice, gasLimit, address, code) {
    let transactionData = [fromNat(nonce), fromNat(gasPrice), fromNat(gasLimit), address, '0x', code];
    return rlp.encode(transactionData);
}

module.exports = {createWallet, createTransaction};