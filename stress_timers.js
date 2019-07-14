class RateCounter {
    constructor(name) {
        this.name = name;
        this.t0 = new Date().getTime();
        this.counter0 = 0;
        this.counter = 0;
    }

    inc() {
        ++this.counter;
    }

    show() {
        let now = new Date().getTime();
        let rate = (this.counter - this.counter0) * 1000 / (now - this.t0);
        this.t0 = now;
        this.counter0 = this.counter;
        console.log(this.name + " rate: " + rate.toFixed(0) + " per sec,\tcounter: " + this.counter);
    }
}

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
    let rate = new RateCounter("timer events");
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
        setTimeout(()=>{
            let dt = new Date().getTime() - startTime;
            if (Math.abs(dt - timeout) > TARGET_PRECISION_MILLIS)
                console.error("dt = " + dt + ", should be " + timeout);
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