import {expect, unit, assert} from 'test'

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
    let privateBytes = await (await io.openRead("../test/pregenerated_key.private.unikey")).allBytes();
    let privateKey = new crypto.PrivateKey(privateBytes);

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