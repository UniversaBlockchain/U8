
// this is just a test file tu run with u8
console.log("testmain started");


function main(args) {
    console.log("main called with args=["+args.join(',')+"]");
    another();
}

import { now } from 'timers';

console.log("time: "+now()/1000);

function another() {
    // throw Error("test");
}