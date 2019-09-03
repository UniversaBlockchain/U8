/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>

#include "AutoThreadPool.h"

AutoThreadPool AutoThreadPool::defaultPool;

AutoThreadPool::AutoThreadPool(size_t maxQueueSize)
        : queue(maxQueueSize), coreThreadCount(thread::hardware_concurrency()), requiredThreadCount(coreThreadCount),
          maxThreadCount(1024) {
    for (size_t i = 0; i < coreThreadCount; i++) {
        unique_lock lock(mxWorkers);
        createThread();
    }
}

static thread_local AutoThreadPool *current_pool = nullptr;

void AutoThreadPool::createThread() {
    // we are acllaed under mutex lock already:
    activeThreadCount++;
    threads.insert(new thread([this]() {
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
            // check we need parking
            {
                unique_lock lock(mxWorkers);
                if (activeThreadCount > requiredThreadCount) {
                    // Park this thread
                    activeThreadCount--;
                    parkedThreadCount++;
                    cvPark.wait(lock);
                    parkedThreadCount--;
                    activeThreadCount++;
                }
            }
        }
    }));
}

AutoThreadPool::~AutoThreadPool() {
    // We need to close it before everything else to make worker thread exit
    queue.close();
    // unpark all parked threads to let them exit normally
    {
        unique_lock lock(mxWorkers);
        // as the queue is already closed, they will just exit run loop
        cvPark.notify_all();
    }
    for (const auto &t: threads) {
//        cout << "deleting thread " << t->get_id() << endl;
        t->join();
        delete t;
    }
}

inline void AutoThreadPool::addActiveThread() {
    unique_lock lock(mxWorkers);
    requiredThreadCount++;
    // there could be unused parked threads
    if (parkedThreadCount > 0) {
        // wake a parked thread
        cvPark.notify_one();
    } else {
        // try to add one more thread
        if (threads.size() < maxThreadCount)
            createThread();
        else
            // not allowed
            insufficientThreadsHit = true;
    }
}

static thread_local unsigned blockgingModeCount = 0;

void AutoThreadPool::setBlocking(bool yes) {
    if (yes) {
        if (blockgingModeCount++ == 0) addActiveThread();
    } else {
        if (--blockgingModeCount == 0) {
            unique_lock lock(mxWorkers);
            if( requiredThreadCount > coreThreadCount )
                requiredThreadCount--;
        }
    }

}


AutoThreadPool::Blocker::Blocker() {
    // we cache it as thread_local storage is much more expensive
    pool = current_pool;
    if( pool ) pool->setBlocking(true);
}

AutoThreadPool::Blocker::~Blocker() {
    // great: we decrease number of threads and workers will exit their loop as need.
    if( pool ) pool->setBlocking(false);
}



