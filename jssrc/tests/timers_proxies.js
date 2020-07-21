/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

async function main(args) {
    // waitExit();
    timeout(300, () => {
            console.log("timer0!!!");
        }
    );
    console.log("Testing timers");
    await sleep(4000);
    console.log("main timer");
    return 17;
}