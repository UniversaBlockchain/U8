const common = require('common.js');
const hash = require('hash.js');
const rlp = require('rlp.js');
const elliptic = require("elliptic.js");
const secp256k1 = new (elliptic.ec)("secp256k1");

/**
 * Generate data for transaction.
 *
 * @param methodHash {string} first 4 bytes Keccak-256 of method signature as hex string.
 * @param parameters {Array} array or method arguments as strings or numbers.
 * @return {string} transaction data as hex string.
 *
 * @throws {Error} invalid arguments
 */
function generateTransactionData(methodHash, parameters) {
    // check arguments
    if (typeof methodHash !== "string" || !methodHash.startsWith("0x") || methodHash.length !== 10)
        throw new Error("methodHash argument is wrong");

    if (!parameters instanceof Array)
        throw new Error("parameters argument must be array");

    let data = methodHash;

    // code parameters
    for (let i = 0; i < parameters.length; i++) {
        let param = parameters[i];

        if (typeof param !== "string" || !param.startsWith("0x")) {
            // convert param
            if (typeof param === "number")
                param = param.toString(16);
            else if (typeof param === "string")
                param = BigInt(param).toString(16);
            else
                throw new Error("parameter " + i + " is wrong");
        } else
            param = param.slice(2);

        if (param.length > 64)
            throw new Error("parameter " + i + " is wrong (too big)");

        data += "0".repeat(64 - param.length);
        data += param;
    }

    return data;
}

/**
 * Create transaction binary.
 *
 * @param chainId {string} chainId as hex string. Get by net_version.
 * @param nonce {string} transaction nonce as hex string. Get by eth_getTransactionCount.
 * @param gasPrice {string} gas price as hex string. Get by eth_gasPrice.
 * @param gasLimit {string} gas limit for transaction as hex string.
 * @param address {string} destination address of transaction as hex string.
 * @param value {string} transaction value as hex string.
 * @param data {string} transaction data as hex string.
 * @return {string} transaction as hex string.
 */
function createTransaction(chainId, nonce, gasPrice, gasLimit, address, value, data = "0x") {
    let transactionData = [common.fromNat(nonce), common.fromNat(gasPrice), common.fromNat(gasLimit),
        address, value, data, common.fromNat(chainId), "0x", "0x"];
    return rlp.encode(transactionData);
}

/**
 * Sign transaction.
 *
 * @param transaction {string} unsigned transaction as hex string.
 * @param privateKey {Uint8Array} private key.
 * @return {string} signed transaction as hex string.
 */
function signTransaction(transaction, privateKey) {
    let transactionData = rlp.decode(transaction);

    const ecKey = secp256k1.keyFromPrivate(privateKey);
    const signature = ecKey.sign(common.hexToBytes(hash.keccak256(transaction)), {canonical: true});

    transactionData[6] = common.fromNumber(common.toNumber(transactionData[6]) * 2 + 35 + signature.recoveryParam);
    transactionData[7] = common.fromNat("0x" + signature.r.toString(16));
    transactionData[8] = common.fromNat("0x" + signature.s.toString(16));

    return rlp.encode(transactionData);
}

module.exports = {generateTransactionData, createTransaction, signTransaction};