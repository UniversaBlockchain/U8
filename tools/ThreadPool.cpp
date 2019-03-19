//
// Created by Sergey Chernov on 2019-01-25.
//

#include <iostream>

#include "ThreadPool.h"

ThreadPool::ThreadPool(size_t maxThreads, size_t maxQueueSize)
        : queue(maxQueueSize), maxThreads(maxThreads) {
    for (size_t i = 0; i < maxThreads; i++) addWorker();
}

void ThreadPool::addWorker() {
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

ThreadPool::~ThreadPool() {
    // We need to close it before everything else to make worker thread exit
    queue.close();
    for( auto t: threads ) {
        t->join();
        delete t;
    }
}

void ThreadPool::addWorkers(size_t count) {
    maxThreads += count;
    for (size_t i = 0; i < count; i++)
        addWorker();
}
