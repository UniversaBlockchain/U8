//
// Created by Sergey Chernov on 2019-01-07.
//

#ifndef U8_ASYNCSLEEP_H
#define U8_ASYNCSLEEP_H

#include <mutex>
#include <condition_variable>
#include <thread>
#include <functional>

#include "Logging.h"

using namespace std;

/**
 * Async sleep using dedicated thread. Could be used as a core for timer queues. Do not use it for timers
 * as it is to not to create excessive threads. Please implement timer queue using it!
 */
class AsyncSleep : Logging {
public:
    AsyncSleep();

    /**
     * Reset to new values. Current delay, if was set, WILL NOT BE CALLED. Turns off callback by passing
     * nullptr value to callback. The callback is single - time, non repeating. You should not use it for such tasks:
     * implement timers pool instead.
     *
     * @param millis to call after
     * @param new_callback, will replace current. Use NULL to disable processing.
     */
    void delay(long millis, const function<void()>&& new_callback);

    ~AsyncSleep();

private:
    mutex mx; //< Mutex to be used woth cv
    condition_variable cv; //< used to implement interruptable sleep

    bool skip = true;

    function<void()> callback;

    long delay_millis;

    bool shutdown = false;

//    static void wait_thread(AsyncSleep *self);

    thread worker;
};


#endif //U8_ASYNCSLEEP_H
