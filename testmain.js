// this is just a test file tu run with u8

let io = require("io");

async function test1() {
    h = await io.openRead("../test/test.txt", "r1")
    console.log("------> opened: " + h);
    // data = await h.read(100);
    // console.log(decodeUtf8(data));
    r = h.reader();
    // while(true) {
    //     let x = await r.nextByte();
    //     if( !x) break;
    //     console.log(x);
    // }
    let i = 200;
    for await (b of r.lines() ) {
        console.log(`--> |${b}|`);
        if( i-- <= 1 ) break;
    }
    // for await (b of r.bytes() ) {
    //     console.log(b);
    //     if( i-- <= 1 ) break;
    // }
    // h._read_raw(32, (data,result) => {
    //     console.log(data,typeof(data), result,decodeUtf8(data));
    // });
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