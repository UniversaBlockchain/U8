
let timerHandler;

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
    timerHandler = __bios_initTimers();
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

// test();

