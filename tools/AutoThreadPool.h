/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_AUTOTHREADPOOL_H
#define U8_AUTOTHREADPOOL_H


#include <functional>
#include <thread>
#include <set>
#include <atomic>
#include "Queue.h"
#include "tools.h"

using namespace std;

/**
 * Automatic thread pool using system parallelism factor and explicit blocking code markup. It tries to maintain
 * optimal number of cuncurrent active threads to prevent unnecessary preemption.
 *
 * Use it simply:
 * \code
 *  AutoThreadPool pool;
 *
 *  pool( [=]() {
 *      // executed in a separated thread
 *      // do not call blocking I/O  and like from it!
 *  });
 * \endcode
 *
 * This way you should execute only non-blocking code, computations and so on. Instead, to perform some blocking operation,
 * sucj as I/O. you should explicitly tell the pool you are blocking:
 *
 *  \code
 *  pool( [=]() {
 *      Blocking;
 *      // now it is safe:
 *      cout << "executed in a separated thread";
 *  });
 * \endcode
 *
 * alternatively, create local instance of AutoThreadPool::Blocker which does it instead of Blocking macro.
 *
 * Thread pool statically create emough threads depending on the system hardware, and automatically allocate
 * more threads as executed task may require (see above). When extra threads are no more used, they will be destroyed.
 * Only set of threads that match hardware parallelism factor are always recycled.
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
class AutoThreadPool : Noncopyable {
public:

    /**
     * the instance of this class (should be automatic var in stack in scope of the executing taks) tell the pool
     * that the code after it is blocking so the pool must add one more worker thread. Destructor automatically tells
     * the pool that no more needed extra thread.
     */
    class Blocker {
    public:
        Blocker();

        ~Blocker();

    private:
        AutoThreadPool *pool;
    };

    /**
     * The callable type
     */
    typedef function<void()> callable;

    /**
     * Construct automatic thread pool with optionally limited queue. If the queue is limited the submission
     * will block until the space in the queue will become available (e.g. by executing scheduled tasks).
     *
     * @param maxQueueSize optional size of the queue. 0 means unlimited which means any calls to it will be
     *          non-blocking (recommended)
     */
    AutoThreadPool(size_t maxQueueSize = 0);

    /**
     * Discard all queued tasks and wait until all threads in pool completes their tasks, then delete threads.
     */
    ~AutoThreadPool();

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
     * @return number of threads in this pool, parked and active
     */
    size_t countThreads() const { return threads.size(); }

    /**
     * count active threads. Active threads perform taks execution loop and potentially cause preemption
     * if their number is greater than hardware_concurrency() unless they are waiting something.
     * @return number of active threads
     */
    size_t countActiveThreads() const { return activeThreadCount; }

    /**
     * Parked threads are allocated but currencly not used threads that do not cause preemption and do not slow
     * down task execution. Parked threads will be automatically reused with Blocking calls.
     * @return number of parked threads
     */
    size_t countParkedThreads() const { return parkedThreadCount; }

    /**
     * Required threads are caluclated accorgin to the current need of parallelism calculated by the Blocking
     * usage. It can be greater than countThreads() or countActivceThreads() if the maximum nmber of allowed threads
     * in the pool is too low.
     *
     * @return current number of required threads
     */
    size_t countRequiredThreads() const { return requiredThreadCount; }


    /**
     * Flags that almost once there were not enough threads to fulfill all requests. It generally means that
     * we should increase maximum number of threads
     * @return true if maximum number of threds should be increased.
     */
    bool insufficientThreads() const { return insufficientThreadsHit; }

    static AutoThreadPool defaultPool;
private:
    uint maxThreadCount;
    uint parkedThreadCount = 0;
    uint coreThreadCount;
    uint requiredThreadCount;
    uint activeThreadCount = 0;

    mutex mxWorkers;
    condition_variable cvPark;

    Queue<callable> queue;
    set<thread *> threads;

    /** Mark current thread (current thread) as performing blocking operations. It is safe to call it more than
     * once, the pool will count and balance calls outcome determinig actual status
     * is automatically dropped.
     *
     * @param yes true if the thread will block execution, false if not
     */
    void setBlocking(bool yes);

    void createThread();

    void addActiveThread();

    bool insufficientThreadsHit = false;
};

/**
 * This macro tells AuthThreadPool that the code below it will use blocking operation (such as sleep,
 * traditional I/O operation ans like. It works in the calling block scope only where and below all blocking
 * operations should be placed. See AuthThreadPool for sample.
 */
#define Blocking AutoThreadPool::Blocker __blocking_guard;

/**
 * Execute block of code in the default async executor (AuthThreadPool::defaultPool instance).
 *
 * \code
 * runAsync( [=]() {
 *      Blocking;
 *      // now it is safe - actually, printstream wants a mutex.
 *      cout << "executed in a separated thread";
 * });
 * \endcode

 * @tparam Function block type
 * @param f block to execute
 */
template<typename Function>
inline void runAsync(Function &&f) {
    AutoThreadPool::defaultPool(move(f));
}

/**
 * Execute block of code in the default async executor (AuthThreadPool::defaultPool instance).
 *
 * auto block = [=]() {
 *      Blocking;
 *      // now it is safe - actually, printstream wants a mutex.
 *      cout << "executed in a separated thread";
 * });
 *
 * runAsync(block)
 * \endcode

 * @tparam Function block type
 * @param f block to execute
 */
template<typename Function>
inline void runAsync(Function &f) {
    AutoThreadPool::defaultPool(f);
}

#endif
