/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_LATCH_H
#define U8_LATCH_H

#include <condition_variable>
#include <mutex>

using namespace std;
/**
 * The usual countdown latch. counts to zer, can wait for it.
 * @tparam T counter type
 */
template<typename T>
class Latch {
public:
    Latch(T count) : counter(count) {}

    auto countDown() {
        unique_lock lock(mx);
        if (counter) {
            if (0 == --counter) {
                cv.notify_all();
            }
        }
        return counter;
    }

    auto wait() {
        unique_lock lock(mx);
        if (counter > 0)
            cv.wait(lock);
    }

    auto count() const { return counter; }

private:
    T counter;
    condition_variable cv;
    mutex mx;
};


#endif //U8_LATCH_H
