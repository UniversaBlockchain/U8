//
// Created by Leonid Novikov on 3/2/19.
//

#ifndef U8_SEMAPHORE_H
#define U8_SEMAPHORE_H

#include <mutex>
#include <condition_variable>

class Semaphore {
public:
    Semaphore(int count = 0) : count_(count) {}

    /**
     * Releases one waiting thread.
     */
    inline void notify() {
        std::unique_lock<std::mutex> lock(mtx_);
        ++count_;
        cv_.notify_one();
    }

    /**
     * Wait for notify. Returning true if it was received, false if timeout expired.
     */
    inline bool wait(std::chrono::milliseconds max_duration = std::chrono::milliseconds::max()) {
        std::unique_lock<std::mutex> lock(mtx_);

        while (count_ == 0) {
            if (cv_.wait_until(lock, (max_duration > std::chrono::hours(1000000)) ? std::chrono::system_clock::time_point::max() : std::chrono::system_clock::now() + max_duration) != std::cv_status::no_timeout)
                return false;
        }
        --count_;
        return true;
    }

    /**
     * Returns internal state, for unit tests.
     */
    inline int count() {
        std::unique_lock<std::mutex> lock(mtx_);
        return count_;
    }

private:
    std::mutex mtx_;
    std::condition_variable cv_;
    int count_;
};

#endif //U8_SEMAPHORE_H
