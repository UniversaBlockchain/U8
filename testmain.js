// this is just a test file tu run with u8

let io = require("io");

// let h = new IoHandle();
function test() {
    let h = new IoHandle();
    console.log("handle: " + h + " : " + h.version);
    let x = h;
    h.open("../test.txt", "r", 0, (result) => {
        console.log("------------------ REsult: " + result + " for handle " + h);
        if (result < 0)
            console.log("error: " + h.getErrorText(result));
        h = undefined;
    });
}

async function test1() {
    h = await io.openRead("../test.1txt", "r")
    console.log("------> opened: " + h);
}

async function main() {
    console.log("hadnle class: " + IoHandle);
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