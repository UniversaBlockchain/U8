// this is just a test file tu run with u8

let io = require("io");
let DefaultBiMapper = require("defaultbimapper").DefaultBiMapper;
let Contract = require("contract").Contract;
let TransactionPack = require("transactionpack").TransactionPack;
let ExtendedSignature = require("extendedsignature").ExtendedSignature;
let roles = require("roles");
let t = require("tools");

async function testReadLines() {
    let input = await io.openRead("../test/test.txt");
    let n = 1;
    for await (let b of input.lines) {
        console.log(`${n++} [${b}]`);
    }
}

async function testSize(path, expectedSize) {
    let input = await io.openRead(path);
    let data = await input.allBytes();
    if (data.length != expectedSize)
        throw Error(`Size mismatch with ${path}: expected ${expectedSize} got ${data.length}`);
}

async function testReadAll() {
        // let input = await io.openRead("../test/test.txt");
        // console.log(await input.allAsString());
        await testSize("../test/test.txt", 57);
        await testSize("../test/testcontract.unicon", 2589);
}

async function testIterateBytes() {
    let input = await io.openRead("../test/test.txt");
    await input.nextByte()
    await input.nextByte()
    let x = await input.read(12);
    assert("this is a te" == utf8Decode(x));
    assert(x.length == 12);
}

async function testWriteBytes() {
    let output = await io.openWrite("../testbytes.bin", 'w', {umask: 0o777});
    await output.write([0x30, 0x31, 0x32, 0x33]);
    await output.close();
}

const Boss = require('boss.js');

function testBoss() {

    //UNCOMMENT TO MAKE BOSS WORK
    //delete Object.prototype.equals;

    let src = {hello: 'world', data: [1, 2, 3]};
    let packed = Boss.dump(src);
    assert(JSON.stringify(Boss.load(packed)) == JSON.stringify(src));
    let reader = new Boss.Reader(packed);
    console.log(JSON.stringify(reader.read()));
    console.log(JSON.stringify(reader.read()));
    let writer = new Boss.Writer();
    writer.write(src);
    assert(packed.toString() == writer.get().toString());
}

async function testCrypto() {
    let privateBytes = await (await io.openRead("../test/pregenerated_key.private.unikey")).allBytes();
    let privateKey = new crypto.PrivateKey(privateBytes);

    let pk1 = new crypto.PrivateKey(privateKey.packed);
    //
    //
    assert(pk1.equals(privateKey));
    assert(privateKey.equals(pk1));

    // console.log("private: " + privateKey);
    let s1 = privateKey.sign("data to sign");
    let s2 = privateKey.sign("data to sign!");
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
    assert(!equalArrays(packed, packed2));
    // assert(new crypto.PublicKey(packed).shortAddress.toString() == publicKey.shortAddress.toString());
    // assert(new crypto.PublicKey(packed).shortAddress.toString() == publicKey.shortAddress.toString());
    // assert(new crypto.PublicKey(packed).shortAddress.toString() == publicKey.shortAddress.toString());

    assert(equalArrays(packed, packed));
    assert(equalArrays(packed, atob(btoa(packed))));

    let fp = publicKey.fingerprints;
    assert(fp.length > 10);
    assert(Object.getPrototypeOf(fp) === Uint8Array.prototype);

    let dd = crypto.digest(crypto.SHA256, "hello, world");
    assert(btoa(dd) == "Ccp+TqpuiunH0mEWcSkYSINkTQffuny/vEyKLgg2DVs=");
}

function logContractTree(contract,prefix) {
    if(!prefix)
        prefix = "";

    console.log(prefix+" "+contract.id.base64);
    let i = 0;
    for(let ri of contract.revokingItems) {
        logContractTree(ri,prefix+".revoke["+i+"]");
        i++;
    }

    i = 0;
    for(let ri of contract.newItems) {
        logContractTree(ri,prefix+".new["+i+"]");
        i++;
    }
}

async function testContract() {


    let input = await io.openRead("../test/ttt.unicon");
    let sealed = await input.allBytes();

    let data = Boss.load(sealed);
    console.log(data.subItems.length);
    for(let x of data.subItems) {
        console.log(btoa(x));
        console.log(crypto.HashId.of(x).base64);
    }

    return;
    let contract = TransactionPack.unpack(sealed).contract;

    logContractTree(contract,"root");


    let privateBytes = await (await io.openRead("../test/pregenerated_key.private.unikey")).allBytes();
    let privateKey = new crypto.PrivateKey(privateBytes);
    let es = ExtendedSignature.verify(privateKey.publicKey,ExtendedSignature.sign(privateKey,sealed),sealed)
    assert(es !== null);

    let c = Contract.fromPrivateKey(privateKey);
    c.seal();
    c.transactionPack = new TransactionPack(c);
    let tp = c.transactionPack.pack();

    let c2 = TransactionPack.unpack(tp).contract;
    assert(t.valuesEqual(c,c2));
}

async function testHashId() {
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
}


async function main() {

    // await testReadAll();
    //await testHashId();
    // await testIterateBytes();
    // await testWriteBytes();
    //testBoss();

    //await testCrypto();
    // testBoss();
    await testContract();
    // let xx = [];//1,2,3,4,5];
    // console.log(xx.reduce((a,b) => a + b, 0));
    // await sleep(100);
    // gc();

    // console.log(btoa(Uint8Array.of(1,2,3)));
    // console.log(atob('AQID'));

    // await sleep(100);
    console.log("done");
}

