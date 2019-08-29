/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_CONDITIONVAR_H
#define U8_CONDITIONVAR_H

#include <mutex>
#include <condition_variable>
#include <thread>

using namespace std;

/**
 * Syntax sugare to conxition_variable + mutex. Simplifies cv usage by putting it all together.
 */
class ConditionVar {
public:

    ConditionVar() {}

    void notify(bool notifyAll = true) {
        unique_lock lock(mx);
        if (notifyAll) cv.notify_all();
        else cv.notify_one();
    }

    void notifyOne() { notify(false); }

    void notifyAll() { notify(true); }

    /**
     * Wait for notify or timeout returning true if notification was received until expired.
     *
     * @param max_duration
     * @return true if notification is received, false if timeout expired but no notification occured.
     */
    bool wait(chrono::milliseconds max_duration = chrono::milliseconds::max() /*getMaxDurationMillis()*/) {
        unique_lock lock(mx);
        return cv.wait_until(lock, (max_duration > chrono::hours(1000000)) ? chrono::system_clock::time_point::max() : chrono::system_clock::now() + max_duration) == std::cv_status::no_timeout;
    }

protected:
    mutex mx;
    condition_variable cv;

//private:
//    inline static chrono::milliseconds getMaxDurationMillis() {
//#ifdef __PLATFORM_DARWIN
//        return chrono::milliseconds::max();
//#else
//        return std::chrono::duration_cast<std::chrono::milliseconds>(
//                chrono::system_clock::time_point::max() - chrono::system_clock::now());
//#endif
//    }

};

#endif //U8_CONDITIONVAR_H
