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
                queue.put(block);
            } catch (const QueueClosedException &e) {
                cerr << "ThreadPool: execute on closed queue\n";
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
                cerr << "ThreadPool: execute on closed queue is ignored\n";
            }
        }

        uv_loop_t* getLoop() { return loop; }

    private:
        Queue<function<void()>> queue;
        std::thread thread;
        uv_loop_t* loop = nullptr;
        atomic<bool> runned = true;
    };
}

#endif //U8_ASYNCLOOP_H
