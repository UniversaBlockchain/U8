//
// Created by Sergey Chernov on 2019-01-25.
//

#ifndef U8_QUEUE_H
#define U8_QUEUE_H

#include <list>
#include <optional>
#include <condition_variable>
#include <mutex>

#include "ConditionVar.h"
#include "vprintf.h"

using namespace std;


class QueueClosedException : public exception {
    using exception::exception;
};

/**
 * Thread-safe FIFO container primarily effective to pass objects between threads.
 */
template<typename T>
class Queue {
public:
    /**
     * Create queue with optionally limited capacity.
     * @param capacity queue capacity, 0 for unlimited.
     */
    Queue(size_t capacity = 0) : _capacity(capacity) {
    }

    void put(T &&value) {
        unique_lock lock(mx);
        while (!_closed && (_capacity && queue.size() >= _capacity))
            cv_full.wait(lock);
        if (!_closed) {
            queue.emplace_back(move(value));
            _size++;
            if (_size == 1) cv_empty.notify_all();
        } else
            throw QueueClosedException();

    }

    void put(const T &value) {
        unique_lock lock(mx);
        while (!_closed && (_capacity && queue.size() >= _capacity))
            cv_full.wait(lock);
        if (!_closed) {
            queue.emplace_back(value);
            _size++;
            if (_size == 1) cv_empty.notify_all();
        } else
            throw QueueClosedException();
    }

    T get() {
        std::unique_lock lock(mx);
        while (!_closed && _size == 0)
            cv_empty.wait(lock);
        if (!_closed) {
            auto result = move(queue.front());
            queue.pop_front();
            _size--;
            if (_capacity && _size == _capacity - 1)
                cv_full.notify_one();
            return result;
        } else
            throw QueueClosedException();
    }

    optional<T> optGet() noexcept {
        unique_lock lock(mx);
        while (!_closed && _size == 0)
            cv_empty.wait(lock);
        if (!_closed) {
            auto result = optional<T>(move(queue.front()));
            queue.pop_front();
            _size--;
            if (_capacity && _size == _capacity - 1)
                cv_full.notify_one();
            return result;
        } else
            return optional<T>();
    }

    bool empty() const { return _size == 0; }

    auto size() const { return _size; }

    auto capacity() const { return _capacity; }

    void close() {
        mx.lock();
        if (!_closed) {
            // tricky part. we want all waiting threads to exit before
            // se destruct cv and mutex, so first we notify them:
            _closed = true;
            cv_empty.notify_all();
            cv_full.notify_all();
            // now we let them go and wait until they unlock, e.g. get out of our wait
            // cycle:
            mx.unlock();
            this_thread::yield();
            // when we lock again, all of them should be already out of our wait methods:
            mx.lock();
        }
        mx.unlock();
    }

    bool closed() const { return _closed; }

    ~Queue() {
        close();
    }

private:
    inline void checkNotClosed() {
        if (_closed) throw QueueClosedException();
    }

    list<T> queue;
    size_t _capacity, _size = 0;

    volatile bool _closed = false;

    mutex mx;
    condition_variable cv_empty;
    condition_variable cv_full;

    Queue(const Queue&);
    Queue(Queue&&);
    Queue& operator=(Queue&&);
    Queue& operator=(const Queue&);

};


#endif //U8_QUEUE_H
