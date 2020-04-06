/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <thread>
#include <atomic>
#include <v8-version.h>

#define CATCH_CONFIG_MAIN

#include "catch2.h"
#include "../tools/tools.h"
#include "../tools/Queue.h"
#include "../tools/vprintf.h"
#include "../tools/AutoThreadPool.h"
#include "../tools/Semaphore.h"
#include "../tools/TimerThread.h"
#include "../tools/latch.h"

TEST_CASE("Queue") {
    SECTION("blocking operations: unlimited capacity") {
        for (int rep = 0; rep < 10; rep++) {
            Queue<int> q;
            REQUIRE(q.empty());
            thread *pthread[3];

            atomic<int> counter(0);
            atomic<int> sum(0);
            atomic<int> isum(0);

            for (int i = 0; i < 3; i++) {
                pthread[i] = new thread([&](auto n) {
                    auto value = q.optGet();
                    if (value) {
                        sum += *value;
                        counter++;
                    }
                }, i);
            }

            q.put(10);
            short i = 20;
            q.put(i);
            q.put(30);

            while (counter < 3) this_thread::sleep_for(20ms);
            REQUIRE(counter == 3);
            REQUIRE(sum == 60);
            q.close();
            for (auto t: pthread) {
                t->join();
                delete t;
            }
        }
    }

    // item class tha prohibits copying still should be
    // usable with the queue:
    class test : Noncopyable {
    public:
        int value;
        test(int _value) : value(_value) {};
        int array[1024];

        test(test&& c) {
            value = c.value;
        }
    };

    SECTION("blocking operations: limited capacity") {
        Queue<test> q(1);
        REQUIRE(q.empty());
        vector<thread *> pthread;

        atomic<int> counter(0);
        atomic<int> sum(0);
        int valid_sum = 0;
        int valid_counter = 0;


        for (int i = 0; i < 30; i++) {
            pthread.push_back(new thread([&](int n) {
                                  try {
                                      while (1) {
                                          auto value = q.get();
                                          sum += value.value;
                                          counter++;
                                      }
                                  }
                                  catch (QueueClosedException) {}
                              }, i)
            );
        }

        for (int i = 0; i < 5; i++) {
            valid_sum += i;
            q.put(test(i));
            REQUIRE(q.size() <= 2);
            valid_counter++;
        }

        this_thread::sleep_for(250ms);
        REQUIRE(counter == valid_counter);
        REQUIRE(sum == valid_sum);
        q.close();
        for (auto t: pthread) {
            t->join();
            delete t;
        }
    }
}

TEST_CASE("Semaphore") {
    std::shared_ptr<Semaphore> sem = std::make_shared<Semaphore>();
    atomic<long> counter(0);

    const int N = 40;
    const int WEIGHT = 100000;

    for (int i = 0; i < N; ++i) {
        runAsync([sem]() {
            for (int c = 0; c < WEIGHT; ++c)
                sem->notify();
        });
        runAsync([sem, &counter]() {
            Blocking;
            do {
                if (sem->wait(10ms))
                    ++counter;
            } while (counter < WEIGHT * N);
        });
    }

    do {
        this_thread::sleep_for(100ms);
        //printf("counter: %li, count_=%i\n", long(counter), sem.count());
    } while (counter < WEIGHT * N);

    REQUIRE(long(counter) == WEIGHT*N);
    REQUIRE(sem->count() == 0);
}

TEST_CASE("Check_V8_version") {
    printf("V8_VERSION: %i.%i\n", V8_MAJOR_VERSION, V8_MINOR_VERSION);
    REQUIRE(V8_MAJOR_VERSION == 8);
    REQUIRE(V8_MINOR_VERSION == 0);
}

TEST_CASE("TimerThread_FixedRate") {
    TimerThread timer;
    long DT = 250;

    Latch latch(4);
    atomic<long> t0 = getCurrentTimeMillis();
    timer.scheduleAtFixedRate([DT,&t0,&latch](){
        long dt = getCurrentTimeMillis() - t0;
        t0 = getCurrentTimeMillis();
        //cout << getCurrentTimeMillis()%10000 << ", dt = " << dt << endl;
        REQUIRE(double(dt) > double(DT)*0.8);
        REQUIRE(double(dt) < double(DT)*1.2 + 20);
        this_thread::sleep_for(chrono::milliseconds(DT/2));
        latch.countDown();
    }, DT, DT);
    latch.wait();
}

TEST_CASE("TimerThread_FixedDelay") {
    TimerThread timer;
    long DT = 250;

    Latch latch(4);
    atomic<long> t0 = getCurrentTimeMillis();
    timer.scheduleWithFixedDelay([DT,&t0,&latch](){
        this_thread::sleep_for(chrono::milliseconds(DT/2));
        long dt = getCurrentTimeMillis() - t0;
        t0 = getCurrentTimeMillis();
        //cout << getCurrentTimeMillis()%10000 << ", dt = " << dt << endl;
        REQUIRE(double(dt) > double(DT)*0.8 + double(DT)/2.0);
        REQUIRE(double(dt) < double(DT)*1.2 + 20 + double(DT)/2.0);
        latch.countDown();
    }, DT, DT);
    latch.wait();
}
