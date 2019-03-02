//
// Created by Sergey Chernov on 2019-01-25.
//
#include <thread>
#include <atomic>

#define CATCH_CONFIG_MAIN

#include "catch2.h"
#include "../tools/tools.h"
#include "../tools/Queue.h"
#include "../tools/vprintf.h"
#include "../tools/ThreadPool.h"
#include "../tools/Semaphore.h"

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
    ThreadPool writerPool(2);
    ThreadPool readerPool(2);

    const int WEIGHT = 100000;

    Semaphore sem;
    atomic<long> counter(0);

    for (int i = 0; i < 10; ++i) {
        writerPool.execute([&sem]() {
            for (int c = 0; c < WEIGHT; ++c)
                sem.notify();
        });
        readerPool.execute([&sem, &counter]() {
            do {
                if (sem.wait(10ms))
                    ++counter;
            } while (counter < WEIGHT * 10);
        });
    }

    do {
        this_thread::sleep_for(100ms);
        //printf("counter: %li, count_=%i\n", long(counter), sem.count());
    } while (counter < WEIGHT * 10);

    REQUIRE(long(counter) == WEIGHT*10);
    REQUIRE(sem.count() == 0);
}
