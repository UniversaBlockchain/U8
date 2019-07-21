// create a worker and call its methods:

const workers = require('workers');

async function sample() {

    // start worker or connect to existing one
    let worker = workers.start("worker.js");

    // We call remote function and wait for the async the answer:
    let result = await worker.foo("bar", "baz");


    // if we want to get some calls from it, we just export a function:
    worker.export.reportFoo = (payload) => {
        console.log("I got a Fpp report: "+payload);
    };

    // and now we can it without waiting the result (no-result):
    worker.fooBar("buz");

    //
    worker.events.close = (woker) => {
        // event handler:
        // remote part has closed us
    }

    // if the worker is no longer needed, it will be GC'd and wil therefore close connection
}

// ------------------------------------------------------------------------------------ worker.js

// Woker start in main() function - well, this _is a tradition:
async function main(gate) {
    // unlike normal main, we have an only argument: gate
    // the purpose of main function is to prepare the gate for future use, exporting some of
    // our methods:

    gate.export.foo = async (bar, baz) => {
        sleep(100);
        return `foo_${bar}_${baz}`;
    }

    gate.export.fooBar = (buz) => {
        console.log("we got a buz: "+buz);
        // and we call remote the same way it asks us:
        gate.fooBar();
    };

    gate.export.panic = () => {
        // this effectively closes gate connection
        gate.close();
    };
}


// sample 2: calling remote ----------------

let worker = new AdvancedWorker("worker.js", {exclusive: true});

worker.export.myMethod = (foo) => { return `${foo}bar`; }
worker.options.someSetting = "bazz";

var remoteInterface = worker.connect();

let remoteBar = await remoteInterface.bar("bar");

// sample 2: worker ------------------------

function main(gate) {
    gate.export.bar = async (bar) => {
        return `local: foo${bar} remote: ${await gate.remoteInterface.foo("foo")}`;
    };
    if( gate.options.someSetting == "bazz" ) {
        //...
    }
}



