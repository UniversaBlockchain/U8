//
// Created by Sergey Chernov on 2019-01-07.
//

#ifndef U8_ASYNCSLEEP_H
#define U8_ASYNCSLEEP_H

#include <mutex>
#include <condition_variable>
#include <thread>
#include "Logging.h"

using namespace std;

/**
 * Async sleep using dedicated thread. Could be used as a core for timer queues. Do not use it for timers
 * as it is to not to create excessive threads.
 */
class AsyncSleep : Logging {
public:
    AsyncSleep();
    /**
     * Reset to new values. Current delay if any WILL NOT BE CALLED.
     *
     * @param millis to call after
     * @param new_callback, will replace current. Use NULL to disable processing.
     */
    void delay(long millis, void(*new_callback));
    ~AsyncSleep();
private:
    mutex mx;
    condition_variable cv;

    bool skip = true;
    void (*callback)();
    long delay_millis;

    bool shutdown = false;

    static void wait_thread(AsyncSleep* self);
    thread worker;
};


#endif //U8_ASYNCSLEEP_H
