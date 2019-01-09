
// This file should be used as U8 CJS module, e.g. evaluated only once then cached.
// It could be 'required' any number of times afterwards.

// This is a main C++ entry point for async delays. It is available only once
// and the js library does it, so client scripts can not access it dynamically anymore.
let timerHandler = __bios_initTimers();


class TimeoutEntry {

}



const myCallback = () => {
    console.log("IN JS timer callback");
}

async function badWait(millis) {
    return  new Promise( function(resolve, reject) {
        timerHandler(millis, resolve);
    });
}

if( timerHandler )
    console.log("Already initialized!");
else {
    console.log("Starting timers initialization")
    timerHandler =
    console.log("Timers proc: "+timerHandler);

    // timerHandler(500, () => {
    //     console.log("? called me");
    // });
    // timerHandler2 = __bios_initTimers();
    // console.log("Timers proc: "+timerHandler2);
}

test();

async function test() {
    console.log("await test started");
    await badWait(500);
    console.log("---------------- after await");
}

let sorted = require("sorted.js");

// test();

