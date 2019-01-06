
let timerHandler

if( timerHandler )
    console.log("Already initialized!")
else {
    console.log("Starting timers initialization")
    timerHandler = __bios_initTimers();
    console.log("Timers proc: "+timerHandler);
    timerHandler(100);
    timerHandler2 = __bios_initTimers();
    console.log("Timers proc: "+timerHandler2);
}