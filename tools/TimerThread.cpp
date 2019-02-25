//
// Created by Leonid Novikov on 2/7/19.
//

#include "TimerThread.h"

TimerThread::TimerThread() {
    worker_ = std::thread([this]() {
        long timeBeforePrevTick = 0;
        while (!shutdown) {
            long curDelayMillis = isStarted_ ? ( initialTick_ ? initialDelayMillis_ : periodMillis_ ) : 9000;
            if (isStarted_ && !initialTick_ && type_ == TimerType::RATE)
                curDelayMillis = std::max(1l, periodMillis_ - (getCurrentTimeMillis() - timeBeforePrevTick));
            if (!cv_.wait(chrono::milliseconds(curDelayMillis))) {
                std::lock_guard guard(callbackMutex_);
                if (isStarted_) {
                    timeBeforePrevTick = getCurrentTimeMillis();
                    if (callback_)
                        callback_();
                    initialTick_ = false;
                }
            }
        }
    });
}

TimerThread::~TimerThread() {
    isStarted_ = false;
    shutdown = true;
    cv_.notifyAll();
    worker_.join();
}

void TimerThread::scheduleAtFixedRate(const std::function<void()> callback, long initialDelayMillis, long periodMillis) {
    callback_ = callback;
    initialDelayMillis_ = initialDelayMillis;
    periodMillis_ = periodMillis;
    type_ = TimerType::RATE;
    isStarted_ = true;
    initialTick_ = true;
    cv_.notifyAll();
}

void TimerThread::scheduleWithFixedDelay(const std::function<void()> callback, long initialDelayMillis, long periodMillis) {
    callback_ = callback;
    initialDelayMillis_ = initialDelayMillis;
    periodMillis_ = periodMillis;
    type_ = TimerType::DELAY;
    isStarted_ = true;
    initialTick_ = true;
    cv_.notifyAll();
}

void TimerThread::stop() {
    std::lock_guard guard(callbackMutex_);
    isStarted_ = false;
    cv_.notifyAll();
}
