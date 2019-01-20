function main(args) {
    waitExit();
    timeout(400, () => {
            console.log("timer!!!");
            exit(7)
        }
    );
    timeout(300, () => {
            console.log("timer0!!!");
        }
    );
    console.log("Testing timers");
    return 11;
}