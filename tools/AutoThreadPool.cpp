//
// Created by Sergey Chernov on 2019-01-25.
//

#include <iostream>

#include "AutoThreadPool.h"

AutoThreadPool AutoThreadPool::defaultPool;

static const auto MAX_THREADS = 128;

AutoThreadPool::AutoThreadPool(size_t maxQueueSize)
        : queue(maxQueueSize), requiredThreads(thread::hardware_concurrency()) {
    for (size_t i = 0; i < requiredThreads; i++) addWorker();
}

static thread_local AutoThreadPool *current_pool = nullptr;

void AutoThreadPool::addWorker() {
    unique_lock lock(mxWorkers);
    if (threads.size() < MAX_THREADS) {
        auto t = new thread([this]() {
            current_pool = this;
            while (true) {
                try {
                    queue.get()();
                }
                catch (const QueueClosedException &x) {
                    break;
                }
                catch (const exception &e) {
                    cerr << "error in threadpool worker: " << e.what() << endl;
                }
                catch (...) {
                    cerr << "unknown error in threadpool worker" << endl;
                }
                // we might need to exit this thread. firts, fast check is done without mutex which is
                // much cheaper:
//                if (threads.size() > requiredThreads) {
//                    // well, now we do it _with_ the mutex to properly handle threads map
//                    // concurrently:
//                    unique_lock lock(mxWorkers);
//                    if (threads.size() > requiredThreads+4) {
//                        threads.erase(this_thread::get_id());
//                        printf("exiting worker thread %lu\n", threads.size());
//                        return;
//                    }
//                }
            }
        });
        threads[t->get_id()] = t;
    }
}

AutoThreadPool::~AutoThreadPool() {
    // We need to close it before everything else to make worker thread exit
    queue.close();
    for (const auto &[_, t]: threads) {
        cout << "deleting thread " << t->get_id() << endl;
        t->join();
        delete t;
    }
}

AutoThreadPool::Blocker::Blocker() {
    // we cache it as thread_local storage is much more expensive
    pool = current_pool;
    // we need to increment it _before_ creating the worker, or some thread can be killed due to race condition
    pool->requiredThreads++;
    // we want only to slow down this thread, as it is going to be blocked anyway, so we create it there
    // rather than check creation condition on each task enqueuing
    pool->addWorker();
    // Great: now pool has one more thread and required threads number matches it.
}

AutoThreadPool::Blocker::~Blocker() {
    // great: we decrease number of threads and workers will exit their loop as need.
    pool->requiredThreads--;
}



