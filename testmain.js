// this is just a test file tu run with u8

let io = require("io");
let Contract = require("contract").Contract;

async function testReadLines() {
    let input = await io.openRead("../test/test.txt");
    let n = 1;
    for await (let b of input.lines) {
        console.log(`${n++} [${b}]`);
    }
}

async function testReadAll() {
    let input = await io.openRead("../test/test.txt");
    console.log(await input.allAsString());
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
    let output = await io.openWrite("../testbytes.bin",'w', {umask: 0o777});
    await output.write([0x30, 0x31, 0x32, 0x33]);
    await output.close();
}

const Boss = require('boss.js');

function testBoss() {
    let src = { hello: 'world', data: [1,2,3]};
    let packed = Boss.dump(src);
    assert(JSON.stringify(Boss.load(packed)) == JSON.stringify(src));
    let reader = new Boss.Reader(packed);
    console.log(JSON.stringify(reader.read()));
    console.log(JSON.stringify(reader.read()));
    let writer = new Boss.Writer();
    writer.write(src);
    assert(packed.toString() == writer.get().toString() );
}

async function testRSA() {
    let privateBytes = await (await io.openRead("../test/pregenerated_key.private.unikey")).allBytes();
    let privateKey = new crypto.PrivateKey(privateBytes);
    console.log("private: "+privateKey);
    let s1 = privateKey.sign("data to sign");
    let s2 = privateKey.sign("data to sign!");
    assert(s1 != s2);
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

    assert(new crypto.KeyAddress(publicKey.shortAddress.toString()).toString() == publicKey.shortAddress.toString());
    assert(new crypto.KeyAddress(publicKey.longAddress.toString()).toString() == publicKey.longAddress.toString());

    let packed = privateKey.packed;
    console.log(packed);
    assert(new crypto.PrivateKey(packed).shortAddress.toString() == privateKey.shortAddress.toString());
    packed = publicKey.packed;
    assert(new crypto.PublicKey(packed).shortAddress.toString() == publicKey.shortAddress.toString());
    // btoa(packed));
    assert(equalArrays(packed, packed));
    assert(equalArrays(packed, atob(btoa(packed))));

}

async function testContract() {
    let input = await io.openRead("../test/testcontract.unicon");
    let sealed = await input.allBytes();
    let contract = Contract.fromSealedBinary(sealed);
}
async function main() {
    // await testReadAll();
    // await testIterateBytes();
    // await testReadAll();
    // await testWriteBytes();
    // testBoss();

    await testRSA();

    //testBoss();
    await testContract();
    // let xx = [];//1,2,3,4,5];
    // console.log(xx.reduce((a,b) => a + b, 0));
    // await sleep(100);
    // gc();
    await sleep(1);
}

