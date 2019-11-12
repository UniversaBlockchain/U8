/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

import * as trs from "timers";
import * as t from "tools";

class ExecutorService {

    /**
     * Executor service controlling the executors.
     *
     * @class
     */
    constructor() {
        this.executors = new t.GenericSet();
    }

    /**
     * Add executor for controlled executors.
     *
     * @param {Executor} executor - Added executor.
     */
    add(executor) {
        this.executors.add(executor);
    }

    /**
     * Remove executor from controlled executors.
     *
     * @param {Executor} executor - Removed executor.
     */
    remove(executor) {
        this.executors.delete(executor);
    }

    /**
     * Cancel all controlled working executors.
     */
    shutdown() {
        this.executors.forEach(executor => executor.cancel());
    }
}

class Executor {
    /**
     * Run executor.
     */
    run() {
        throw new Error("not implemented");
    }

    /**
     * Cancel executor.
     */
    cancel() {
        throw new Error("not implemented");
    }

    /**
     * Restart executor.
     */
    restart() {
        throw new Error("not implemented");
    }

    /**
     * Equals executors.
     */
    equals(to) {
        return this === to;
    }

    toString() {
        return crypto.HashId.of(t.randomBytes(64)).base64;
    }

    stringId() {
        if (this.stringId_ == null)
            this.stringId_ = this.toString();

        return this.stringId_;
    }
}

class ScheduleExecutor extends Executor {

    /**
     * Prepare executor with timeout. After a single triggered shutdown.
     *
     * @class
     * @param {function} lambda - Lambda-function for scheduled execution.
     * @param {number} timeout - Timeout in milliseconds.
     * @param {ExecutorService} executorService - Executor service controlling the executor. Optional.
     */
    constructor(lambda, timeout, executorService = undefined) {
        super();
        this.lambda = lambda;
        this.timeout = timeout;
        this.es = executorService;
        this.timer = null;
        this.cancelled = false;

        if (executorService != null)
            executorService.add(this);
    }

    /**
     * Run executor (after timeout).
     */
    run() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        this.timer = trs.timeout(this.timeout, this.lambda);

        return this;
    }

    /**
     * Cancel executor.
     */
    cancel() {
        if (this.cancelled)
            return;

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();
        this.cancelled = true;

        if (this.es != null)
            this.es.remove(this);
    }

    /**
     * Restart executor.
     */
    restart() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();

        return this.run();
    }
}

class ExecutorWithFixedPeriod extends Executor {

    /**
     * Prepare executor with fixed period.
     *
     * @class
     * @param {function} lambda - Lambda-function for scheduled execution.
     * @param {number} period - Period in milliseconds.
     * @param {ExecutorService} executorService - Executor service controlling the executor. Optional.
     */
    constructor(lambda, period, executorService = undefined) {
        super();
        this.lambda = lambda;
        this.period = period;
        this.es = executorService;
        this.timer = null;
        this.cancelled = false;

        this.timerCallback = async () => {
            if (!this.cancelled) {
                this.timer = trs.timeout(this.period, this.timerCallback);

                try {
                    await this.lambda();
                } catch (e) {
                    console.error("ExecutorWithFixedPeriod error: " + e);
                }
            }
        };

        if (executorService != null)
            executorService.add(this);
    }

    /**
     * Run executor.
     */
    run() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        this.timer = trs.timeout(this.period, this.timerCallback);

        return this;
    }

    /**
     * Cancel executor.
     */
    cancel() {
        if (this.cancelled)
            return;

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();
        this.cancelled = true;

        if (this.es != null)
            this.es.remove(this);
    }

    /**
     * Restart executor.
     */
    restart() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();

        return this.run();
    }
}

class ExecutorWithDynamicPeriod extends Executor {

    /**
     * Prepare executor with dynamic period.
     *
     * @class
     * @param {function} lambda - Lambda-function for scheduled execution.
     * @param {Array<number>} periods - Array of periods in milliseconds.
     * @param {ExecutorService} executorService - Executor service controlling the executor. Optional.
     */
    constructor(lambda, periods, executorService = undefined) {
        super();
        this.lambda = lambda;
        this.periods = periods;
        this.es = executorService;
        this.timer = null;
        this.cancelled = false;
        this.waitsCount = 0;

        this.timerCallback = async () => {
            if (!this.cancelled) {
                this.waitsCount++;
                let period = this.periods[(this.waitsCount >= this.periods.length) ? this.periods.length - 1 : this.waitsCount];
                this.timer = trs.timeout(period, this.timerCallback);

                try {
                    await this.lambda();
                } catch (e) {
                    console.error("ExecutorWithFixedPeriod error: " + e);
                }
            }
        };

        if (executorService != null)
            executorService.add(this);
    }

    /**
     * Run executor.
     */
    run() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        this.timer = trs.timeout(this.periods[0], this.timerCallback);

        return this;
    }

    /**
     * Cancel executor.
     */
    cancel() {
        if (this.cancelled)
            return;

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();
        this.cancelled = true;

        if (this.es != null)
            this.es.remove(this);
    }

    /**
     * Restart executor.
     */
    restart() {
        if (this.cancelled)
            throw new Error("Executor was cancelled");

        if (this.timer == null)
            throw new Error("Executor not running");

        this.timer.cancel();
        this.waitsCount = 0;

        return this.run();
    }
}

class EventTimeoutError extends Error {
    constructor(message = undefined) {
        super();
        this.message = message;
    }
}

class AsyncEvent {
    constructor(executorService = undefined) {
        this.result = null;
        this.fired = false;
        this.es = executorService;
        this.timer = null;
        this.event = new Promise((resolve, reject) => {
            this.fireCallback = resolve;
            this.rejectCallback = reject;
        });
    }

    addConsumer(consumer) {
        this.event.then(consumer);
    }

    fire(result = null) {
        this.fireCallback(result);
        this.fired = true;
        this.result = result;
        if (this.timer != null)
            this.timer.cancel();
    }

    async await(milliseconds = 0) {
        if (!this.fired) {
            if (milliseconds > 0) {
                let tError = new EventTimeoutError("Timeout error after " + milliseconds + " ms");
                this.timer = new ScheduleExecutor(() => this.rejectCallback(tError),
                    milliseconds, this.es).run();
            }

            return await this.event;
        }

        return this.result;
    }
}

module.exports = {ExecutorService, Executor, ScheduleExecutor, ExecutorWithFixedPeriod, ExecutorWithDynamicPeriod,
    EventTimeoutError, AsyncEvent};