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

/**
 * Create random wallet.
 *
 * @return wallet object {
 *     address: {string} address as hex string,
 *     privateKey: {string} privateKey as hex string
 * }
 */
function createWallet() {
    const innerHex = hexToBytes(hash.keccak256(randomBytes(64)));
    const outerHex = hexToBytes(hash.keccak256(concat(concat(randomBytes(32), innerHex), randomBytes(32))));
    return fromPrivate(outerHex);
    // const outerHex = hash.keccak256(concat(concat(randomBytes(32), innerHex), randomBytes(32)));
    // let x = fromPrivate(hexToBytes(outerHex));
    // x.privateKey = outerHex;
    // return x;
}

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
 * @param nonce {string} transaction nonce as hex string. Get by eth_getTransactionCount.
 * @param gasPrice {string} gas price as hex string. Get by eth_gasPrice.
 * @param gasLimit {string} gas limit for transaction as hex string.
 * @param address {string} destination address of transaction as hex string.
 * @param value {string} transaction value as hex string.
 * @param code {string} transaction code as hex string.
 * @return {string} transaction as hex string.
 */
function createTransaction(nonce, gasPrice, gasLimit, address, value, code = "0x") {
    let transactionData = [fromNat(nonce), fromNat(gasPrice), fromNat(gasLimit), address, value, code];
    return rlp.encode(transactionData);
}

/**
 * Generate http request (body) for eth.estimateGas.
 *
 * @param id {number} request id.
 * @param from {string} transaction sender address as hex string.
 * @param to {string} transaction receiver (or contract) address as hex string.
 * @param value {string | null} transaction value as hex string.
 * @param data {string | null} transaction data as hex string.
 * @return {string} estimateGas request body.
 */
function generateEstimateGasRequest(id, from, to, value = null, data = null) {
    let request = '{"jsonrpc":"2.0","method":"eth_estimateGas","params":[{"from": "' + from + '","to": "' + to;

    if (value)
        request += '","value": "' + value;
    if (data)
        request += '","data": "' + data;

    return request + '"}],"id":' + id + '}';
}

module.exports = {createWallet, generateTransactionData, createTransaction, generateEstimateGasRequest};