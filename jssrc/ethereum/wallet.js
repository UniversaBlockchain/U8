const hash = require('hash.js');
const common = require('common.js');
const elliptic = require("elliptic.js");
const secp256k1 = new (elliptic.ec)("secp256k1");

const toChecksum = address => {
    const addressHash = hash.keccak256s(address.slice(2));
    let checksumAddress = "0x";
    for (let i = 0; i < 40; i++)
        checksumAddress += parseInt(addressHash[i + 2], 16) > 7
            ? address[i + 2].toUpperCase()
            : address[i + 2];
    return checksumAddress;
};

/**
 * Create wallet from private key.
 *
 * @param {Uint8Array} privateKey - private key.
 * @return {Object} wallet object {
 *     address: {string} address as hex string,
 *     privateKey: {string} privateKey as hex string
 * }
 */
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

/**
 * Create random wallet.
 *
 * @return {Object} wallet object {
 *     address: {string} address as hex string,
 *     privateKey: {string} privateKey as hex string
 * }
 */
function createWallet() {
    const innerHex = common.hexToBytes(hash.keccak256(common.randomBytes(64)));
    const outerHex = common.hexToBytes(hash.keccak256(common.concat(common.concat(common.randomBytes(32), innerHex),
        common.randomBytes(32))));
    return fromPrivate(outerHex);
}

module.exports = {createWallet};