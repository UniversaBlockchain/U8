// this is just a test file tu run with u8

let io = require("io");

async function test1() {
    h = await io.openRead("../test/test.txt", "r1")
    console.log("------> opened: " + h);
}

async function main() {
    await test1();
    await sleep(100);
    gc();
    await sleep(1000);
}

// import { now } from 'timers';
//
// console.log("time: "+now()/1000);
//
// function another() {
//     throw Error("test");
// }