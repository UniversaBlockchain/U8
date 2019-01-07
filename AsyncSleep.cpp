//
// Created by Sergey Chernov on 2019-01-07.
//

#include "AsyncSleep.h"

#include <thread>

AsyncSleep::~AsyncSleep() {
    shutdown = skip = true;
    mx.lock();
    cv.notify_all();
    mx.unlock();
    worker.join();
}

AsyncSleep::AsyncSleep() : skip(true), callback(0), delay_millis(0x7FFFffffFFFF), Logging("ASLP") {
    worker = thread([this]() {
        log("entering");
        unique_lock<std::mutex> lock(mx);
        while (!shutdown) {
            cv.wait_for(lock, chrono::milliseconds(delay_millis));
            put_log(100, "activate, skip:", skip);
            if (!skip)
                callback();
            else
                skip = false;
        }
        log("exiting");
    });
}