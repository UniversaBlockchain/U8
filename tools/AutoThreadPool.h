//
// Created by Sergey Chernov on 2019-01-25.
//

#ifndef U8_AUTOTHREADPOOL_H
#define U8_AUTOTHREADPOOL_H


#include <functional>
#include <thread>
#include <map>
#include "Queue.h"
#include "tools.h"

using namespace std;

/**
 * Automatic thread pool using system parallelism factor and explicit blocking code markup.
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
 *  * \code
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
            queue.put(block);
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
    void operator()(callable &&block) { execute(block); }

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

private:
    atomic_uint requiredThreads;
    mutex mxWorkers;
    Queue<callable> queue;
    map<thread::id, thread *> threads;

    void addWorker();
};

#define Blocking AutoThreadPool::Blocker __blocking_guard;

#endif
