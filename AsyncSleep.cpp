//
// Created by Sergey Chernov on 2019-01-07.
//

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
        unique_lock<std::mutex> lock(mx);
        while (!shutdown) {
            cv.wait_for(lock, chrono::milliseconds(delay_millis));
            put_log(100, "activate, skip:", skip);
            if (!skip) {
                // fire
                callback();
                // prevent repeat
                delay_millis = TOO_LONG;
                // free any resources
                callback = empty_block;
            }
            else
                skip = false;
        }
        log("exiting");
    });
}

void AsyncSleep::delay(long millis, const function<void()>& new_callback) {
    unique_lock<std::mutex> lock(mx);
    skip = true;
    delay_millis = millis;
    callback = new_callback;
    cv.notify_all();
}

