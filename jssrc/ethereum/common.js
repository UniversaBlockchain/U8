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

module.exports = {randomBytes, hexToBytes, concat, fromNumber, toNumber, fromNat};