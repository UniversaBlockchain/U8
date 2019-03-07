//
// Created by Dmitriy Tairov on 19.02.19.
//

#ifndef U8_ASYNCLOOP_H
#define U8_ASYNCLOOP_H

#include <uv.h>
#include <functional>
#include <atomic>
#include "../tools/Queue.h"

namespace asyncio {

    /**
     * Asynchronous loop class with task queue.
     */
    class AsyncLoop {
    public:
        AsyncLoop();
        ~AsyncLoop();

        /**
         * schedule a task: execute a block in async loop thread
         * @param block lambda to execute.
         */
        void addWork(function<void()> &&block) {
            try {
                queue.put(std::move(block));
            } catch (const QueueClosedException &e) {
                cerr << "AsyncLoop: execute on closed queue\n";
            }
        }

        /**
         * schedule a task: execute a block in async loop thread
         * @param block lambda to execute.
         */
        void addWork(function<void()> &block) {
            try {
                queue.put(block);
            } catch (const QueueClosedException &e) {
                cerr << "AsyncLoop: execute on closed queue is ignored\n";
            }
        }

        /**
         * Get a handle of asynchronous loop
         * @return handle of asynchronous loop.
         */
        uv_loop_t* getLoop() { return &loop; }

    private:
        Queue<function<void()>> queue;
        std::thread thread;
        uv_loop_t loop;
        atomic<bool> runned = true;
    };
}

#endif //U8_ASYNCLOOP_H
