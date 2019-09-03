/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>

#include "ThreadPool.h"

FixedThreadPool::FixedThreadPool(size_t maxThreads, size_t maxQueueSize)
        : queue(maxQueueSize), maxThreads(maxThreads) {
    for (size_t i = 0; i < maxThreads; i++) addWorker();
}

void FixedThreadPool::addWorker() {
    if (maxThreads && threads.size() < maxThreads)
        threads.push_back(new thread([this]() {
            while (true) {
                try {
                    queue.get()();
                }
                catch (const QueueClosedException& x) {
                    break;
                }
                catch (const exception &e) {
                    cerr << "error in threadpool worker: " << e.what() << endl;
                }
                catch (...) {
                    cerr << "unknown error in threadpool worker" << endl;
                }
            }
        }));
}

FixedThreadPool::~FixedThreadPool() {
    // We need to close it before everything else to make worker thread exit
    queue.close();
    for( auto t: threads ) {
        t->join();
        delete t;
    }
}

void FixedThreadPool::addWorkers(size_t count) {
    maxThreads += count;
    for (size_t i = 0; i < count; i++)
        addWorker();
}
