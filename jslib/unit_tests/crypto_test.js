import {expect, unit, assert} from 'test'
import * as tk from 'unit_tests/test_keys'
const t = require("tools");

unit.test("symmetric keys", () => {
    let plain = "fucked up beyond all recognition";
    let sk1 = new crypto.SymmetricKey();
    let sk2 = new crypto.SymmetricKey();
    expect.notEqualArrays(sk1.packed, sk2.packed);
    let sk11 = new crypto.SymmetricKey(sk1.packed);
    expect.equal(sk1, sk11);

    let cipherText = sk1.etaEncrypt(plain);
    expect.equal(utf8Decode(sk11.etaDecrypt(cipherText)), plain);
    expect.throws(crypto.Exception, () => sk2.etaDecrypt(cipherText));
});

import * as io from 'io'

unit.test("asymmetric keys", async () => {
    let privateKey = new crypto.PrivateKey(await io.fileGetContentsAsBytes("../test/pregenerated_key.private.unikey"));

    let pk1 = new crypto.PrivateKey(privateKey.packed);

    expect.equal(privateKey.publicKey.bitStrength, 2048);
    assert(privateKey.bitStrength == 2048);

    let newKey = await crypto.PrivateKey.generate(2048);
    assert(newKey.bitStrength == 2048);
    assert(newKey instanceof crypto.PrivateKey);
    assert(!newKey.equals(privateKey));

    assert(pk1.equals(privateKey));
    assert(privateKey.equals(pk1));

    let s1 = await privateKey.sign("data to sign");
    let s2 = await privateKey.sign("data to sign!");
    assert(!equalArrays(s1, s2));
    assert(s1.length == 256);

    let publicKey = privateKey.publicKey;
    assert(await publicKey.verify("data to sign", s1));
    assert(!await publicKey.verify("data to sign!", s1));
    assert(await publicKey.verify("data to sign!", s2));

    // console.log(publicKey.longAddress);
    assert(privateKey.shortAddress.toString() == publicKey.shortAddress.toString());
    assert(privateKey.longAddress.toString() == publicKey.longAddress.toString());
    assert(publicKey.shortAddress.toString().length < publicKey.longAddress.toString().length);

    assert(new crypto.KeyAddress(publicKey.shortAddress.packed).toString() == publicKey.shortAddress.toString());
    assert(new crypto.KeyAddress(publicKey.longAddress.packed).toString() == publicKey.longAddress.toString());

    let ska = publicKey.shortAddress;
    let lka = publicKey.longAddress;
    assert(ska.match(publicKey));
    assert(lka.match(publicKey));

    assert(new crypto.KeyAddress(publicKey.shortAddress.toString()).toString() == publicKey.shortAddress.toString());
    assert(new crypto.KeyAddress(publicKey.longAddress.toString()).toString() == publicKey.longAddress.toString());

    let packed = privateKey.packed;
    // console.log(packed);
    assert(new crypto.PrivateKey(packed).shortAddress.toString() == privateKey.shortAddress.toString());

    let packed2 = publicKey.packed;
    expect.notEqualArrays(packed, packed2);

    assert(equalArrays(packed, packed));
    assert(equalArrays(packed, atob(btoa(packed))));

    let fp = publicKey.fingerprints;
    assert(fp.length > 10);
    assert(Object.getPrototypeOf(fp) === Uint8Array.prototype);

    let plain = "fucked up beyond all recognition";
    let cipherText = await publicKey.encrypt(plain);
    let plain1 = utf8Decode(await privateKey.decrypt(cipherText));

    expect.equal(plain, plain1);

    let badCipherText = new Uint8Array(cipherText);
    badCipherText[0] = badCipherText[0] ^ 42;
    await expect.throws(crypto.Exception, () => privateKey.decrypt(badCipherText));
});

unit.test("digest", async () => {
    let dd = crypto.digest(crypto.SHA256, "hello, world");
    assert(btoa(dd) == "Ccp+TqpuiunH0mEWcSkYSINkTQffuny/vEyKLgg2DVs=");
});

unit.test("HashId", () => {
    let x = crypto.HashId.of("hello, world");
    // console.log(x.digest);
    // console.log(x.base64);
    let y = crypto.HashId.withDigest(x.digest);
    assert(equalArrays(x.digest, y.digest));
    assert(x.equals(y));
    assert(x.base64.length > 50);
    assert(x.base64 == y.base64);
    let z = crypto.HashId.withBase64Digest(x.base64);
    assert(z.equals(x));
});

unit.test("ExtendedSignature cpp", async () => {
    Boss.asyncLoad(null);
    let privKey = tk.TestKeys.getKey();
    let pubKey = privKey.publicKey;
    let dataset = [];
    let N = 20;
    for (let i = 0; i < N; ++i) {
        dataset.push(new Promise(async resolve => {
            let data = t.randomBytes(10000);
            let sig = await ExtendedSignature.sign(privKey, data);
            let badData = data.slice(0);
            for (let j = 0; j < 100; ++j)
                badData[j] = j;
            let row = {data:data, sig:sig, badData:badData};
            resolve(row);
        }));
    }
    dataset = await Promise.all(dataset);
    for (let i = 0; i < N; ++i) {
        let row = dataset[i];
        let es1js = await ExtendedSignature.jsVerify(pubKey, row.sig, row.data);
        let es0js = await ExtendedSignature.jsVerify(pubKey, row.sig, row.badData);
        let es1cpp = await ExtendedSignature.cppVerify(pubKey, row.sig, row.data);
        let es0cpp = await ExtendedSignature.cppVerify(pubKey, row.sig, row.badData);
        assert(es1cpp.equals(es1js));
        assert(es0js === null);
        assert(es0cpp === null);
    }
});
