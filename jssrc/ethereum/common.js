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
    return hex.length % 2 === 0 ? "0x" + hex : "0x0" + hex;
};

const toNumber = hex =>
    parseInt(hex.slice(2), 16);

const fromNat = bn =>
    bn === "0x0" ? "0x" : bn.length % 2 === 0 ? bn : "0x0" + bn.slice(2);

const toNat = bn =>
    bn[2] === "0" ? "0x" + bn.slice(3) : bn;

const pad = (l,hex) =>
    hex.length === l*2+2 ? hex : pad(l,"0x"+"0"+hex.slice(2));

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

module.exports = {randomBytes, hexToBytes, concat, fromNumber, toNumber, fromNat, toNat, pad, generateEstimateGasRequest};