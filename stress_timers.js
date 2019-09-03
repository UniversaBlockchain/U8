/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

const t = require('tools.js');

async function main() {
    console.log("stress_timers.js started");

    // for logging timeout deviation
    let TARGET_PRECISION_MILLIS = 500;

    let FILL_TIMER_QUEUE_TO_SIZE = 8000;
    let MIN_TIMEOUT = 50;
    let MAX_TIMEOUT = 4000;

    if (MAX_TIMEOUT < MIN_TIMEOUT) {
        console.error("MAX_TIMEOUT should be >= MIN_TIMEOUT");
        return;
    }
    let rate = new t.RateCounter("timer events");
    let sendCounter = 0;
    let readyCounter = 0;

    let stopHeartbeat = false;
    let heartbeat = new Promise(async resolve => {
        while(!stopHeartbeat) {
            await sleep(1000);
            rate.show();
        }
        resolve();
    });

    for (let i = 0; i < 2000000000; ++i) {
        let timeout = MIN_TIMEOUT + Math.floor(Math.random()*(MAX_TIMEOUT - MIN_TIMEOUT));
        let startTime = new Date().getTime();
        ++sendCounter;
        setTimeout(async ()=>{
            let dt = new Date().getTime() - startTime;
            if (Math.abs(dt - timeout) > TARGET_PRECISION_MILLIS)
                console.log("  warning: dt = " + dt + ", should be " + timeout);
            await sleep(10);
            ++readyCounter;
            rate.inc();
        }, timeout);

        if (sendCounter - readyCounter > FILL_TIMER_QUEUE_TO_SIZE) {
            await sleep(10);
        }
    }

    stopHeartbeat = true;
    await heartbeat;
    while (readyCounter < sendCounter)
        await sleep(10);
}