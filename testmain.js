// this is just a test file tu run with u8

let io = require("io");

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

async function main() {
    // await testReadAll();
    // await testIterateBytes();
    // await testReadAll();
    await testWriteBytes();
    // let xx = [];//1,2,3,4,5];
    // console.log(xx.reduce((a,b) => a + b, 0));
    // await sleep(100);
    // gc();
    // await sleep(1000);
}

