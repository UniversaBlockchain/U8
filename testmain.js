// this is just a test file tu run with u8

let io = require("io");

async function test_read_lines() {
    let handle = await io.openRead("../test/test.txt");
    let n = 1;
    for await (b of handle.lines ) {
        console.log(`${n++} [${b}]`);
    }
}

async function test_read_lines2() {
    let handle = await io.openRead("../test/test.txt");
    let [a, b] = await handle.reader.lines();
    console.log(a, b,"--end");
}

async function main() {
    await test_read_lines();
    // await sleep(100);
    // gc();
    // await sleep(1000);
}

// import { now } from 'timers';
//
// console.log("time: "+now()/1000);
//
// function another() {
//     throw Error("test");
// }