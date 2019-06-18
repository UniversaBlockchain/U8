import {expect, assert, unit} from 'test'
import {ScheduleExecutor, EventTimeoutError, AsyncEvent, ExecutorWithFixedPeriod} from "executorservice";

unit.test("asyncevent_test: await", async () => {
    let event = new AsyncEvent();
    new ScheduleExecutor(() => event.fire(123),
        1000).run();

    assert(!event.fired);
    assert(event.result == null);
    assert(event.timer == null);

    let res = await event.await();

    assert(event.fired);
    assert(res === 123);
    assert(event.result === 123);
    assert(event.timer == null);
});

unit.test("asyncevent_test: await milliseconds", async () => {
    let event = new AsyncEvent();
    new ScheduleExecutor(() => event.fire("qwerty"),
        1000).run();

    assert(!event.fired);
    assert(event.result == null);

    let promise = event.await(2000);

    assert(!event.fired);
    assert(event.result == null);
    assert(event.timer != null);
    assert(!event.timer.cancelled);

    let res = await promise;

    assert(event.fired);
    assert(res === "qwerty");
    assert(event.result === "qwerty");
    assert(event.timer.cancelled);
});

unit.test("asyncevent_test: await timeout", async () => {
    let event = new AsyncEvent();
    new ScheduleExecutor(() => event.fire("!!!"),
        1000).run();

    assert(!event.fired);
    assert(event.result == null);

    let promise = event.await(500);

    assert(!event.fired);
    assert(event.result == null);
    assert(event.timer != null);
    assert(!event.timer.cancelled);

    let res = null;
    try {
        res = await promise;
    } catch (err) {
        assert(err instanceof EventTimeoutError);
    }

    assert(!event.fired);
    assert(event.result == null);
    assert(res == null);
    assert(!event.timer.cancelled);
});