//
// Created by Sergey Chernov on 2019-01-27.
//

#include <atomic>
#include <chrono>
#include "catch2.h"
#include "../tools/ThreadPool.h"
#include "../tools/Semaphore.h"
#include "../tools/latch.h"

TEST_CASE("ThreadPool") {
    SECTION("fixed") {
        ThreadPool pool(10);
        atomic<int> sum(0);
        atomic<int> count(0);
        int valid_count = 0;
        int valid_sum = 0;
        int limit = 1000;

        REQUIRE(pool.queueSize() == 0);
        REQUIRE(pool.countThreads() == 10);

        for (int i = 0; i < limit; i++) {
            valid_count++;
            valid_sum += i;
            pool([&sum, &count, i]() {
                count++;
                sum += i;
                if( i <= 11 ) this_thread::sleep_for(5ms);
            });
        }
        REQUIRE(pool.queueSize() > 1);
        this_thread::sleep_for(100ms);
        REQUIRE(count == valid_count);
        REQUIRE(sum == valid_sum);
    }

    SECTION("addWorkers") {
        ThreadPool pool(1);
        REQUIRE(pool.countThreads() == 1l);
        int limit = 4;
        int time = 80;
        Semaphore sem;
        long t0 = getCurrentTimeMillis();
        for (int i = 0; i < limit; i++)
            pool([&sem,time](){this_thread::sleep_for(chrono::milliseconds(time));sem.notify();});
        for (int i = 0; i < limit; i++)
            sem.wait();
        long dt = getCurrentTimeMillis() - t0;
        REQUIRE(dt <= long(limit*time*1.3));
        REQUIRE(dt >= long(limit*time*0.7));

        pool.addWorkers(3);
        REQUIRE(pool.countThreads() == 4l);
        for (int i = 0; i < limit; i++)
            pool([&sem,time](){this_thread::sleep_for(chrono::milliseconds(time));sem.notify();});
        t0 = getCurrentTimeMillis();
        for (int i = 0; i < limit; i++)
            sem.wait();
        dt = getCurrentTimeMillis() - t0;
        REQUIRE(dt <= long(time*1.3));
        REQUIRE(dt >= long(time*0.7));
    }

    SECTION("check rvalue lambda") {
        static int copyCounter = 0;
        static int moveCounter = 0;
        class RValueTestClass {
        public:
            RValueTestClass() = default;
            RValueTestClass(const RValueTestClass& copyFrom) {
                ++copyCounter;
            }
            RValueTestClass(RValueTestClass&& moveFrom) {
                ++moveCounter;
            }
            void printSomething() const {
                cout << "printSomething" << endl;
            }
        };

        FixedThreadPool pool(1);
        Latch blocker(1);
        RValueTestClass t;
        pool([&blocker,&t](){
            t.printSomething();
            blocker.countDown();
        });
        blocker.wait();
        cout << "copyCounter: " << copyCounter << endl;
        cout << "moveCounter: " << moveCounter << endl;
//        REQUIRE(copyCounter == 0);
//        REQUIRE(moveCounter == 2);
    }
}
