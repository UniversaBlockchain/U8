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


/**
 * The exception raised when attempted to put or get to the closed queue.
 */
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

    /**
     * put a value into the queue (emplace, actually).
     *
     * if capacitry was set to non-zero, could block until the space will be freed.
     *
     * @param value to enqueue.
     * @throws QueueClosedException if the queue is closed
     */
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

    /**
     * put a value into the queue (emplace, actually).
     *
     * if capacitry was set to non-zero, could block until the space will be freed.
     *
     * @param value to enqueue.
     * @throws QueueClosedException if the queue is closed
     */
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

    /**
     * Get the value from the queue. Block until it is available. FIFO order.
     *
     * @return next value from the queue.
     * @throws QueueClosedException if the queue is closed
     */
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

    /**
     * Get the value from the queue. Return empty optional if it is empty. Does not block.
     *
     * @return next value from the queue or empty optional.
     * @throws QueueClosedException if the queue is closed
     */
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

    /**
     * @return true if the queue is empty
     */
    bool empty() const { return _size == 0; }

    /**
     * @return current size of the queue
     */
    auto size() const { return _size; }

    /**
     * @return capacity of the queue. 0 means unlimited.
     */
    auto capacity() const { return _capacity; }

    /**
     * Closes the queue. All waiting threads will be unblocked and the QueueClosedException will be thrown in them.
     */
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

    /**
     * @return true if this queue is closed
     */
    bool closed() const { return _closed; }

    /**
     * Closes the queue and frees its resources, see also close()
     */
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

    Queue(const Queue &);

    Queue(Queue &&);

    Queue &operator=(Queue &&);

    Queue &operator=(const Queue &);

};


#endif //U8_QUEUE_H
