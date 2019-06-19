import {expect, assert, unit} from 'test'
import {ExecutorService, ExecutorWithFixedPeriod} from "executorservice";

const Lock = require("lock").Lock;

unit.test("lock_test: synchronize executors", async () => {

    let es = new ExecutorService();
    let lock = new Lock();
    let result = 0;
    let counts = [];
    let errors = 0;

    for (let i = 1; i <= 5; i++) {
        counts[i] = 0;

        new ExecutorWithFixedPeriod(async () => {
            await lock.synchronize("mutex", async () => {
                let res = result;
                counts[i]++;

                await sleep(20);

                if (res !== result)
                    errors++;
                assert(res === result);
                result += i;

                await sleep(50);

                if (res + i !== result)
                    errors++;
                assert(res + i === result);
            });
        }, i * 100, es).run();
    }

    console.log("waiting...");
    await sleep(800);

    es.shutdown();

    await sleep(2000);

    let expected = 0;
    for (let i = 1; i <= 5; i++)
        expected += i * counts[i];

    assert(result === expected);
    assert(errors === 0);
});