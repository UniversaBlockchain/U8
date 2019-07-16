const puts = console.log
const println = console.log

function bm(name, callable) {
    let start = new Date().getTime();
    let result = callable();
    console.log(`: ${name}: ${new Date().getTime() - start}`)
    return result;
}

import {SortedArray,FastPriorityQueue} from "sorted";

class A {
    value = 0

    constructor(x) { this.value = x }

    toString() {
        return `A(${this.value})`;
    }
}

async function main(args) {


    // let q = FastPriorityQueue((a,b) => a.value < b.value );
    // q.add(new A(1));
    // q.add(new A(3));
    // q.add(new A(2));
    //
    // while( q.peek() ) console.log("> "+q.poll());
    // return;
    //


    let arr = bm("SortedArray: generation", () => {
        let arr = new SortedArray();
        for (let i = 0; i < 10; i++) {
            arr.add(Math.random());
        }
        return arr;
    });
    let pq = bm("FastPriorityQueue: generation", () => {
        let pq = FastPriorityQueue();
        for (let i = 0; i < arr.length; i++) {
            pq.add(Math.random());
        }
        return pq;
    });
    for (let repeat = 0; repeat < 100; repeat++) {
        bm("SortedArray: remove/add 100000 items", () => {
            for (let i = 0; i < 100000; i++) {
                arr.removeLast();
                arr.add(Math.random());
            }
        });
        bm("FastPriorityQueue: remove/add 100000 items", () => {
            for (let i = 0; i < 100000; i++) {
                pq.poll();
                pq.add(Math.random());
            }
        });
        await sleep(100);
    }
}