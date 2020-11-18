const common = require('common.js');
const hash = require('hash.js');
const BN = require('bn.js');
const elliptic = require("elliptic.js");
const secp256k1 = new (elliptic.ec)("secp256k1");

const signaturePrefix = '\x19Ethereum Signed Message:\n';

function splitSignature(signature) {
    if (!signature.startsWith("0x"))
        throw new Error("Signature must be hex string");
    if (signature.length !== 132) // 0x + 65 bytes as hex
        throw new Error("Signature length must be 65 bytes");

    let sig = {};
    sig.r = new BN(signature.substring(2, 66), 16);
    sig.s = new BN(signature.substring(66, 130), 16);
    sig.recoveryParam = 1 - (parseInt(signature.substring(130), 16) % 2);

    return sig;
}

/**
 * Check signature presented as object. For example:
 * {
 *      "address": "0x2056f5ac47f93c4cd89fddfe926c1a5d4d82d7d8",
 *      "msg": "Signed message",
 *      "sig": "0x200224e397b7c73d767d4ce0f23b9dd99479487b1f1bcb6255c584f4997b273f3f2bde42c2dd11f2bbaff3cf24be8d2e0c9d97fcf0a844e0e5768843456023141b",
 *      "version": "2"
 * }
 *
 * @param signature {object} signature object.
 * @return {boolean} true if valid.
 *
 * @throws {Error} invalid signature
 */
function verifySignature(signature) {
    if (signature.version !== "2")
        throw new Error("Not compatible with signature version " + signature.version);

    let msg = common.hexToBytes(hash.keccak256(utf8Encode(signaturePrefix + signature.msg.length.toString(10) + signature.msg)));

    let sig = splitSignature(signature.sig);
    let pubKeyRecovered = secp256k1.recoverPubKey(msg, sig, sig.recoveryParam, "hex");
    let valid = secp256k1.verify(msg, sig, pubKeyRecovered);
    let publicHash = hash.keccak256("0x" + pubKeyRecovered.encode("hex").substr(2));
    let address = "0x" + publicHash.slice(-40);

    return valid && address.toLowerCase() === signature.address.toLowerCase();
}

module.exports = {verifySignature};