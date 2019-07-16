// This file should be used as U8 CJS module, e.g. evaluated only once then cached.
// It could be 'required' any number of times afterwards.

// This is a main C++ entry point for async delays. It is available only once
// and the js library does it, so client scripts can not access it dynamically anymore.

import {FastPriorityQueue} from "sorted";

let timerHandler = __bios_initTimers();


// let entries = new SortedArray([], (a, b) => b.fireAt - a.fireAt);
let entries = new FastPriorityQueue((a, b) => a.fireAt < b.fireAt);

class TimeoutError extends Error {
}

/**
 * Timer queue entry. Use {timeout()} to create one.
 */
class TimeoutEntry {

    field1 = "hello1";
    static field2 = "hello2";

    /**
     * Create immediately effective timer entry
     * @param millis to wait
     * @param callback to fire on timeout
     * @param repeat now is always false and ignored
     */
    constructor(millis, callback, reject = undefined, repeat = false) {
        this.fireAt = new Date().getTime() + millis;
        this.callback = callback;
        this.repeat = repeat;
        this.reject = reject;
        registerTimeoutEntry(this);
    }

    cancel() {
        entries.remove(this);
        if (this == entries.peek())
            resetCallback();
        if (this.reject) this.reject(new TimeoutError("timeout cancelled"));
    }

    toString() {
        return `TimeoutEntry<${this.fireAt}:${this.repeat}:${this.callback}>`
    }
}

function processQueue() {
    while (true) {
        let e = entries.peek();
        if (!e || e.fireAt > new Date().getTime())
            break;
        entries.poll();
        e.callback();
    }
    resetCallback();
}

const systemStart = new Date().getTime();

/**
 * Shortcut for Date#getTime, returns number of milliseconds since unix epoc (01/01/1970).
 * @returns {number}
 */
function now() {
    return new Date().getTime();
}

/**
 * Average milliseconds since scripting subsystem start
 * @returns {number} number of milliseconds
 */
function currentMillis() {
    return now() - systemStart;
}

function resetCallback() {
    // console.log("reset callback, entries: "+entries.map(x => ""+x+"\n"))
    let last = entries.peek();
    // console.log("last "+last);
    if (last) {
        let closest = last.fireAt;
        let left = closest - now();
        if (left <= 0)
            processQueue();
        else
            timerHandler(left, processQueue);
    }
    // console.log("TMQ:" + (currentMillis()));
    // entries.forEach(x => console.log(`--- ${x.callback} at ${x.fireAt - now()}`))
}

function registerTimeoutEntry(entry) {
    entries.add(entry);
    resetCallback();
}

/**
 * Create single time timeout callback
 *
 * @param millis to wait before firing callback
 * @param callback to fire
 * @returns {TimeoutEntry} that can be used to cancel timout (use entry.cancel())
 */
function timeout(millis, callback, reject) {
    return new TimeoutEntry(millis, callback, reject);
}

/**
 * create Promise that resolves after specified time (async sleep). The returned Promise has
 * {cancel()} method that rejects the promise and cancels associated TimeoutEntry. The rejection
 * uses {TimeoutError} error object. Note that cancellable promise will usually be much slower than
 * system default promise without cancellation so it is optional feature neede to be explicitly requested.
 *
 * @param millis to resolve
 * @param cancellable set to true to have {cancel()} method in the returned promise (less effective)
 * @returns {Promise<void>} that resolves after millis
 */
function sleep(millis, cancellable = false) {
    let entry;
    let promise = new Promise((resolve, reject) => {
        entry = timeout(millis, resolve, reject)
    });
    if (cancellable)
        promise.cancel = () => entry.cancel();
    return promise;
}

/**
 * Legacy setTimout
 *
 * @param callback to call
 * @param millis to wait
 * @returns {TimeoutEntry}
 */
function setTimeout(callback, millis) {
    return timeout(millis, callback)
}

/**
 * Legacy clearTimeout. Must use what {setTimeout} has retutrned (as always).
 *
 * @param entry returned by setTimout()
 */
function clearTimeout(entry) {
    entry.cancel();
}

module.exports = {sleep, timeout, setTimeout, clearTimeout, currentMillis, now, version: "1.0"};
