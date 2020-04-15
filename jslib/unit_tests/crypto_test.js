/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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

unit.test("RSA 8192 keys", async () => {
    let pk8192 = new crypto.PrivateKey(atob("JgAcAQABxAAC+b9BLJKfUM+09ZNeu8Ie0pEglBBbIxK496MMq3F3M+sEGyYMR374rLj/cmX9VjxdTRetfJleXca2JQL4TZ4xj8b1ZL904PMIWwUx5uKmZ1BWmVxyvQBrpQGtIY1lql75pFk4ZAn4ciayMoKuudcjsFZ37miN+WlF9ihaKbECGudd+Aw+peExV/sOemMZ1TRUiPBZ4MJgtgTJH/NWbRptXdnPznT7TEOFyESSUYMM210RbWmR84QI9PQ5FDpICkj6D5yEQqBoQbEJXbrsKRohB04WpGVbiEBs1PAjc9I/J53+k4moUwsGrlZ7HHbs0nl0UnhXUw4CnKRoR/t2+wO82y2GJqzxsbwHO3kmVGESD14zLxvX7fXCG2cAlzOdWq66L2sIHmFFZGf6AJ4Bf+RAy3iEyPuUgSUvxaG6ZxeTfcJR4OttRB17OXfD/EKJgvvo53rc21O2xC1JaGt212c5cW0z6kzU/yOT8RrjOt11FWQbX6S0DIizQjv7gpBqQ5njIuO9aP53vyJKH+7DF0E5ykXJSVKkzEzhzoynzjQz0oz8S/Ze/cZYw1OTZCNxLmYelYbgbjNinLWkoT4go98eO2mxQSncvW5a+t8jAF+uK9tTCjJNqcpgGYw6/+JlrG5A5djdx8s5PIUPsAZ5xPPJWSy3XnlFkKc+PiNu6ER4LzfEAALaY/v9hiHOexy3OU4agoKn2ByTStfec9R0Zs7IPRqw7cVdPL2TlrWgGKKkZrX31xi6CXxz6e1SmKvsE3xEtnbw+nvcBjNOXBI6U1oGk4G9iNELIypclcmgD7pPyzhenNoRI71LRxihyuNhQt0IILhKwR65iRBmhqtNXU8lvraoxnfM3NZgrVoNOSCzTXC4eq9u7BzcQl8K00tmaDEeZLlJGIFRHFaYbp+PMAeMXr3zw+dwDBUiuOiHkh6edu1rWEVPHGTvkvssF8JohM+sSbNc8l043tgUIEK/sWGyJzCPl3yTnTAlVz6K8dAn70oxLaPzimGIoc0fVNEvo/InezG40OBzaxcFd2L7aCRYV+NnoEnZSWL7KcN/fObj6BF1n9JrQ/MJGyUWCUtIq7kKcCEA6iJq1mge5DX2O1SHELHvSKe3VdQPEDlCA4KgHl3C7cUrD2W1ujJtnLghcKqO9uA1U4gVsWrYtSq40Kb9k64oyMh5b9nmIAhD/DIitqrEkQIheAVBRWbgAikoMRQ7GST0FD2CYNMm9rF96pRunMW1sima3FXfrI4cNX2oppaKSQO7wtWa2CRYqul5hNijPveh9+cGZ1hDWogv5pYYrIV1LKekHo8vkSMyH9WysMb6MlUODrLK+1sbfF10Pns/+XACXLXKxMpkKtWKUPp+VSVlTQ=="));
    let pub8192 = new crypto.PublicKey(pk8192);
    let pk8192other = new crypto.PrivateKey(atob("JgAcAQABxAACwB++35oge3nPKDllCGoEJ8C2kh4gJtLU11VOz8TrXPUUgxdPYZatPPd9T792rhaLrSxgz9FHXfbRtPSqDn6dD9SWd9Ucc6NnCWd0uynNo4Lxd8F73ymISDB0LKBW+w8cHKeTASVyhOq3np8xXWOZqLgAP/y8SP2Azp8Aj+mtjUC+6VPa/H1LXJJmpXUKpbz7TVM4ypQ00K1YCyXJx/9R7dzC+fMVKeupRkRAxMa6n7xfJL4avmLKbADgu9k7j8BUgCTdKepY+WfdUojwshagfoJOizSC8Hxd2qewDUB3np/DnDCCP8EjYcRtiY3YlugarQvU7HuOpzEjE5vBClS6pSw6vmsSaCb1528eZTg8pqUuRaIO5f6rfIqQhNvYmKZ/Jbm4fw1UL9df53fOY6CchlZfZkelwZ7FnrD9EMgK/hyO0KgQDoB0vMVz5KAE4+HNbb9XQFYaLE5jushb+MrJ+gI1ps/K9+PB7i4WaLwE/57A4JKhvOsJwyG43+eZIFXnt4sg95QRoTImTi487rQiapBxQqM9O5YrvxYi462qSdcgaXmVA9ioPHlOHxJbRFVvg4o4AICNYZFnz+5yZlL6AeELVL7HnO0DrzFJ5Un2I15gktOogDT3IRm8juoc5UzrrrrCPJhuRAt22ogZPbc95dlI7zQOsF8K19hd5wdENdnEAALvs77vNxtG0U6rmEg43N7y34KwR850k+Hb/HEGkUKdihKk5iY2C54Aa0RAGwSIKRaCVWq8an47COC4JBbOH2QICPlzhKDgIMXN/FXmjDYTmrA21rT1TH1Qf1kSLaZ8vurWpsGNwrMSx8hYx+HJYzttIXfEjYtJhYCQ2cAiXIwh4DHCVUuLpQxYzMAAS84ovakl6rae2IPKgCMm7EGaqIXwQWEP1vu/svs5fONxKV7Iv/s5/NZrKW95hT2QU9YmTcwiby32w9poQkTTt/4skHSr/40g4AKnFcMhAArdj9G7m/3A2sVtzRK2daN0oqU4HGI5NStpCyPqOGIPF+BUC5s7pc/MDwC31q3FgqBRl5rwv7g9AHh6PNzBedq81LCBq19YNmg22k9WJNIQgO6QH0vagtz/RX2U4B1Ua8tVk19DZcTRAAjg2N1w5squoQDk9gaMsCuIlfddCwOnUvdQq3dvFeCs1ixti3F0RxMuplqSUdmbwGAwJSsdW12MoSWa9j0P6VPEEyQJ4N/NqHQRUrQ5djfNGGpup0/VhdAalzQbpVxrDv93wjeTiBa3j8Z8fK5KJwiOHXjakqL0/yJLJCWCa6WHvKsyB64IViubIi3TL7Jqa+NEua0yszf8tB9DRg5OXCIICjP7zUdcckctAwrEcnIGvvS3K3pbeoIHRIoriQ=="));
    let pub8192other = new crypto.PublicKey(pk8192other);
    console.log("pk8192 fingerprints: " + btoa(pub8192.fingerprints));
    assert(btoa(pub8192.fingerprints) === "B2bvZnsfTqydPUHXA06EfE6T7jp/teLFpdkWaKGDmzD0");
    console.log("pk8192 shortAddress: " + pub8192.shortAddress);
    assert(pub8192.shortAddress.toString() === "2dk6jojaU5WaD9TBSSxrRhaHxCUdUSTMchWrjbBdKstxXgzGpP1");
    console.log("pk8192 longAddress: " + pub8192.longAddress);
    assert(pub8192.longAddress.toString() === "t7fSS9cZWHYxgn1Jjj4kVLVwv8Jvjqgb7ZXLwx2HyFkn9UDufeo8TgjNzVFYCrtuACfN9cDg");
    let encryptedJava = "sD2TpG6uakxFeWFT2s4B/VVhaMSOh6Rzukfu41l2qhCd2M0HiU7e6kb8qyp5A6xOrpRJM6yzJkccuSsdFaUf0iGCQtoki/nA7z1YOI30znFF3koBHPHew6uG1Hy1sxn+rV0wNpkE8E1ddQzRNfWmIw+zrrM/Me+tHuBtPOTHcwiutCtYr7h9+vJ0wg8d19ocwbtjjTEIuO5h3a3ilmoCSoQ86mE9PGSmx5mQgO4o1c7J62Eerlu1gwQKfUkoT6wiKy3dWvTmxvCYQR8jOCALRx4yh9CSqPIa+zZUWnDwbXLE6gNyM+a+rnFrMoGwMONOl893k9BakKu1RLIZL+wal3FUAjtNFH24GwYFk/2Td6/KE4APAi7QP/qn7OdYywnqJc2lbfKU4Vk5HaQOZWifu7LWdDc3ydnNH0UQAOew7jJSxsW/ck95ZsS/UnZ2r3r4iX3M8h4n2aJeElQ+92zrh8uUF3Xo2x/xriVT2fRhsdXBvqyF1tbpXXJciHaa2AF1Zv7DMXvU1tjvwbCuKwcJSUL/ra9iw9wiUKO6kXJx94HEyh7R3R0OyriMs9mOt7pzkwwqXI6mBDALNSAvydcxSqtCzkNa43TiO10shRaf7HYDm6bfFvuImnUEv2SmBrRWJMdNZrUQNw6cQXYMdzG4GtIrqoWNDBk/N4cXBv34YM8bRMAsdXFv9G2kpAIZ87iSrwzTP+H2F6XwAQr8x48+LQIP1Yc1EN4FQXS+AtI/T7VdmAscPIQ+SFbXuvs7K2DXY3fPaFipdu4NiiJFYP9jNLCbtW9b9FFKc3OETcTX+RYnkQITC6mrLkPksj7jC904SwBSvXZs/eLCL/4mqlKEHcnrtOvF7GeNz6ZmgBzhm1f51LtO5NgerpYt7ysi8AgHstqWEp8x3rkPHn0g4VRcdsN4dvPsl72rs7kNFvEQ6Xb46WKAXT9/phpCkeuJilDIuiCyIh2ozG5ewArXePcy+98F6Ih0x82VWNIOBdRzRQ1BRYDKVKT8MoVUYUDLIbtEAdOLBA7+30hetXmqflj9mctqj1QJCzCIx8km0SpQHhwO7GXH4oYsw2a9RgjvlabRugX7A6T6VGD5U8bJBFdcwDEUdrZA7SsJSnmgWncNMubCBgX6HaS8b5synng2YuyoLR8LH+4J43SAd7scKTRzk82dhweMjpuLkHncpd4MRDt0mIoIrRS3TIbgWxN7yYY+vp73d0dxKH1PSw01J8zgJXSigPkNGAqvvzbymgilLorFAUsXkjQXhbYsMM0+0mQoEpYQGFqImyYQdO1Y65Fu94kfzFjKEVo1eV9h8Q5GhAvoPne279Su14lgIIZVM3L1AnRbDjQe/FH06hB9O9c4oA==";
    let decryptedJava = await pk8192.decrypt(atob(encryptedJava));
    console.log("decryptedJava: " + utf8Decode(decryptedJava));
    assert(utf8Decode(decryptedJava) === "hello rsa 8192");
    let encrypted = await pub8192.encrypt("rsa hello 8192");
    let decrypted = await pk8192.decrypt(encrypted);
    console.log("decrypted: " + utf8Decode(decrypted));
    assert(utf8Decode(decrypted) === "rsa hello 8192");
    assert(pk8192.bitStrength === 8192);
    let body = "some text";
    let sigJs = await pk8192.sign(body);
    assert(await pub8192.verify(body, sigJs) === true);
    assert(await pub8192other.verify(body, sigJs) === false);
    let sigJava = atob("aWRSaPsS3XeapGcu3CNQbAtgQ0YYKFlFs9Nf30uXvGXIHehyT5BSi63LNcfbdx/igiKiW1P19EkYIYjm6ZSIevAaapAH8nSItqYAHLGBjh1dqFRSk/ZQ5b870ZRM2LQJ4S4HZVB/Az6hawZhSc8Kch9RmxGnPkS2x+ZysqIrBa5/TuXORYVObiXI7R1WWg6D7Q9Mw17i8x4+PVWm32SjAcBwx+q2wlku8yVJQbOx4wjU8s73O4mUhMhd3OzOozZrfOvc5uWMtpiDjs07DV2sUoUnd94K37e5jrmGI5zDqIH5r/No7IHtkbc5Lj4j4sVIpUTO3xLV3aSyDHCUXdOSacDP6HN5xbF7H5dnW/81z020JFL4cmc7y/sMgwOyxyvOET8bbnwYjNNXAigUs3iprftSIEGfMNML3PrZ504pzTAMr8xR9Dl/+MxlcE3Gr5BZdtrBX7XOe0vCZPgtWYKPzj5TPFEMi/Zr13VUD+c+EXOWoTLZ7ed6KTYoi1UA3e/xLSGjQXteqoaex6lpRoj/3SGF+mcvbfwAj4GvMHjWGqKRzFh7yP4HIbCD5DYSJvQwgPbrGHbqS0LOkH8KlvVZM6T7St50eEujVO8qJDWSBbIJWBi5sab65faEaFvlm8nZb1m0KqOt5YboExFcu5tExxX7M8DnlwrDRz+bM27alh6yjA99EUnIrn2UdT3jCu2V5R6mwBeuqgnpOoIcnmLch+Hj1aHAkjJswqew25s9hPRL8u0iKlOjQEuQXf/NFDxcPeWKmHjTVPWJFkbPX+3bpmvLRy/ERKLytUn9m1uH8HMeHyOqY2eeZyc+wECJFa07ZaSbTahZTGDv6XonzhTVmncfi9LcCK5GA02P2e5LHeyw+4y6MXaMRoWbSr6xczgH0Fy0f+SjtsjWEY3SvEa8Vscu8GvbAyfDc9AlJ7wJ2X6xE8G8QLBIHzQBjGwJmpuFy2G3Y2sj3lwwLTOCLSvqFoF42vuddPmDWGVmSTeDfby2iJADrKGRIJBKS6SVMNiZQ4EfobFwwnGv1ZYXD7rxT2oXajSmmJtPRpdCjro+QIKDi++ydqjFbyzPWVMII9jR6IcWOdccEhn/0P9ZtEKZiB7jFBXJHSdgQZ6TxmeywmGiGHcNLdHIoIxrSZY2i6YG3+QE8STj8Okx+XjXbUsr/DZrjvtX7YMrYhNPf+RxTTGKxqWJ2c9u+YPwtUKYzVTEDTL7e8kq3czqaPyPg6Z5CyO5QaNSeiRCzi2pcjF1h+5MtUR07ZD/i7+3fBIyAhNu/X/uxKgLwPMb3xgvxk4kErIGcy+pHGjoAyuPO1VtdDDCKM7pX5uw8ORczkT17lqHHBSe1sotlcsER8mE9U2nIA==");
    assert(await pub8192.verify(body, sigJava) === true);
    assert(await pub8192other.verify(body, sigJava) === false);
    let generated8192Key = await crypto.PrivateKey.generate(8192);
    console.log("generated8192Key b64: " + btoa(generated8192Key.packed));
    assert(generated8192Key.bitStrength === 8192);
});
