/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_TIMERTHREAD_H
#define U8_TIMERTHREAD_H

#include <functional>
#include <thread>
#include <atomic>
#include "tools.h"
#include "Semaphore.h"

class TimerThread : Noncopyable, Nonmovable {

public:

    TimerThread();
    virtual ~TimerThread();

    /**
     * Schedules the specified task for repeated fixed-rate execution, beginning after the specified delay. Subsequent
     * executions take place at approximately regular intervals, separated by the specified period.
     */
    void scheduleAtFixedRate(const std::function<void()> callback, long initialDelayMillis, long periodMillis);

    /**
     * Creates and executes a periodic action that becomes enabled first after the given initial delay, and subsequently
     * with the given delay between the termination of one execution and the commencement of the next.
     */
    void scheduleWithFixedDelay(const std::function<void()> callback, long initialDelayMillis, long periodMillis);

    /**
     * Stops the timer, but don't destroys worker.
     * You can start timer again with another parameters, use scheduleAtFixedRate or scheduleWithFixedDelay.
     */
    void stop();

private:
    enum class TimerType {RATE, DELAY};

private:
    std::function<void()> callback_;
    std::thread worker_;
    Semaphore sem_;
    long initialDelayMillis_ = 0;
    long periodMillis_ = 9000;
    TimerType type_ = TimerType::RATE;
    std::atomic<bool> isStarted_ = false;
    std::atomic<bool> initialTick_ = true;
    std::atomic<bool> shutdown = false;
    std::mutex callbackMutex_;

};

#endif //U8_TIMERTHREAD_H
