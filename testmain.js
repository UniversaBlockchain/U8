
// this is just a test file tu run with u8
console.log("main started");

async function someIoOperation() {
    await sleep(200);
    console.log("async processed");
    throw Error("abnormal");
    return 11;
}

async function main(args) {
    await someIoOperation();
}

// import { now } from 'timers';
//
// console.log("time: "+now()/1000);
//
// function another() {
//     throw Error("test");
// }