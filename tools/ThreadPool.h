//
// Created by Sergey Chernov on 2019-01-25.
//

#ifndef U8_THREADPOOL_H
#define U8_THREADPOOL_H


#include <functional>
#include <thread>
#include "Queue.h"
#include "tools.h"

using namespace std;

class ThreadPool : Noncopyable, Nonmovable {
public:
    typedef function<void()> callable;

    ThreadPool(size_t maxThreads, size_t maxQueueSize = 0);

    ~ThreadPool();

    void execute(callable &&block) { queue.put(block); }

    void execute(callable &block) { queue.put(block); }

    void operator()(callable &&block) { execute(block); }

    void operator()(callable &block) { execute(block); }

    size_t queueSize() const { return queue.size(); }

    size_t countThreads() const { return threads.size(); }


protected:
    size_t maxThreads;
    Queue<callable> queue;
    vector<thread *> threads;

    void addWorker();
};


#endif //U8_THREADPOOL_H
