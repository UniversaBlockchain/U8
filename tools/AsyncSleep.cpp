/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "AsyncSleep.h"

#include <thread>

static const long TOO_LONG = 0x7FFFffffFFFF;

static function<void()> empty_block = []() {};

AsyncSleep::~AsyncSleep() {
    shutdown = skip = true;
    mx.lock();
    cv.notify_all();
    mx.unlock();
    worker.join();
}

AsyncSleep::AsyncSleep() : skip(true), callback(0), delay_millis(TOO_LONG), Logging("ASLP") {
    worker = thread([this]() {
        log("entering");
        while (!shutdown) {
            decltype(callback) cb;
            {
                unique_lock<std::mutex> lock(mx);
                skip = false;
                cv.wait_for(lock, chrono::milliseconds(delay_millis));
                if( skip || shutdown) {
                    // just re-run loop
                    continue;
                }
                else {
                    // no repeat, and release block resources
                    delay_millis = TOO_LONG;
                    cb = callback;
                    callback = empty_block;
                }
            }
            if (cb)
                cb();
        }
        log("exiting");
    });
}

void AsyncSleep::delay(long millis, const function<void()>&& new_callback) {
    unique_lock<std::mutex> lock(mx);
    skip = true;
    delay_millis = millis;
    callback = new_callback;
    cv.notify_one();
}

