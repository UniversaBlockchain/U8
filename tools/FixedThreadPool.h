/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_FIXED_THREAD_POOL_H
#define U8_FIXED_THREAD_POOL_H


#include <functional>
#include <thread>
#include "Queue.h"
#include "tools.h"

using namespace std;

/**
 * Fixed thread pool.
 *
 * Use it simply:
 * \code
 *  ThreadPool pool(32;
 *
 *  pool( [=]() {
 *      cout << "executed in a separated thread";
 *  });
 * \endcode
 *
 *  Thread pool statically create specified number of threads which can not be changed later.
 *
 *  When a task is sumbitted with execute() or pool() it will either immediately executed if there are
 *  idle threads or will be buffered in the queue and executed as soon as some thread will be ready.
 *
 *  Tasks are executed in FIFO order.
 *
 *  thread destructor ensures all currently executing tasks will complete, thout all scheduled (e.g. waiting
 *  in queue) tasks will be discarded.
 *
 */
class FixedThreadPool : Noncopyable {
public:
    /**
     * The callable type
     */
    typedef function<void()> callable;

    /**
     * Construct foxed thread pool with optionally limited queue. If the queue is limited the submission
     * will block until the space in the queue will become available (e.g. by executing scheduled tasks).
     *
     * @param maxThreads required number of threads in the pool. Threads are allocated in constructor and freed in
     *          descturctor.
     * @param maxQueueSize optional size of the queue. 0 means unlimited.
     */
    FixedThreadPool(size_t maxThreads, size_t maxQueueSize = 0);

    /**
     * Discard all queued tasks and wait until all threads in pool completes their tasks, then delete threads.
     */
    ~FixedThreadPool();

    /**
     * Sometimes we need to create ThreadPool not from constructor, but somewhere else in code. This method helps.
     */
    void addWorkers(size_t count);

    /**
     * schedule a taks: execute a block in first available thread of the pool
     * @param block labmda to execute.
     */
    void execute(callable &&block) {
        try {
            queue.put(move(block));
        } catch (const QueueClosedException &e) {
            cerr << "ThreadPool: execute on closed pool\n";
        }
    }

    /**
     * schedule a taks: execute a block in first available thread of the pool
     * @param block labmda to execute.
     */
    void execute(callable &block) {
        try {
            queue.put(block);
        } catch (const QueueClosedException &e) {
            cerr << "ThreadPool: execute on closed pool is ignored\n";
        }
    }

    /**
     * schedule a taks: execute a block in first available thread of the pool
     * @param block labmda to execute.
     */
    void operator()(callable &&block) { execute(move(block)); }

    /**
     * schedule a taks: execute a block in first available thread of the pool
     * @param block labmda to execute.
     */
    void operator()(callable &block) { execute(block); }

    /**
     * @return number of tasks (scheduled lambdas) that are waiting to start.
     */
    size_t queueSize() const { return queue.size(); }

    /**
     * @return number of threads in this pool
     */
    size_t countThreads() const { return threads.size(); }


protected:
    size_t maxThreads;
    Queue<callable> queue;
    vector<thread *> threads;

    void addWorker();
};

#endif
