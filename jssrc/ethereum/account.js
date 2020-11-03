const secp256k1 = new (elliptic.ec)("secp256k1");
const Bytes = require("./bytes");
const Nat = require("./nat");

const encodeSignature = ([v, r, s]) =>
    Bytes.flatten([r,s,v]);

const makeSigner = addToV => (hash, privateKey) => {
    const signature = secp256k1
        .keyFromPrivate(new Uint16Array(privateKey.slice(2)))
        .sign(new Uint16Array(hash.slice(2)), {canonical: true});
    return encodeSignature([
        Nat.fromString(Bytes.fromNumber(addToV + signature.recoveryParam)),
        Bytes.pad(32, Bytes.fromNat("0x" + signature.r.toString(16))),
        Bytes.pad(32, Bytes.fromNat("0x" + signature.s.toString(16)))]);
}

const sign = makeSigner(27);