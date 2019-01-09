// This file should be used as U8 CJS module, e.g. evaluated only once then cached.
// It could be 'required' any number of times afterwards.

// This is a main C++ entry point for async delays. It is available only once
// and the js library does it, so client scripts can not access it dynamically anymore.
let timerHandler = __bios_initTimers();


// const {SortedArray} = {...require("sorted")};
const {arraysEqual} = {...require("tools")};
import { SortedArray, binarySearch } from 'sorted'

class TimeoutEntry {

}


const myCallback = () => {
    console.log("IN JS timer callback");
}

async function badWait(millis) {
    return new Promise(function (resolve, reject) {
        timerHandler(millis, resolve);
    });
}

test();

async function test() {
    console.log("await test started");
    await badWait(500);
    console.log("---------------- after await");
}


let s = new SortedArray([7, 6, 5]);
console.log("imported: " + s.toArray());
if (!arraysEqual(s.toArray(), [5, 6, 7])) {
    throw Error("bad sorted array");
}

// test();

