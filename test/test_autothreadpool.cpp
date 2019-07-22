//
// Created by Leonid Novikov on 2/21/19.
//

#include <iostream>
#include <chrono>
#include "catch2.h"
#include "../tools/latch.h"
#include "../tools/AutoThreadPool.h"
#include "../tools/FixedThreadPool.h"

using namespace std;

using namespace std::chrono;

long millis() {
    return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

template<typename F>
long bm(F block) {
    auto start = millis();
    block();
    return millis() - start;
}

TEST_CASE("AutoThreadPool") {
    SECTION("process blocking") {
        AutoThreadPool& pool = AutoThreadPool::defaultPool;
        unsigned int N = thread::hardware_concurrency();
        REQUIRE(pool.countThreads() == N);

        // long running task
        auto fn = []() {
            long x = 0;
            for( long i =0; i < 300000000; i++ )
                x = (((x << 1) + i) * 17) ^ 0x3fe1;
            return x;
        };

        auto t1 = bm(fn);
//        cout << "single time " << t1 << endl;

        Latch remaining(N);
        Latch blockers(20);
        auto nBlockers = blockers.count();
        Latch blockersStarted(nBlockers);

        // blocking task should not spoil the pool:
        for( int i=0; i<nBlockers; i++ ) {
            async([&]() {
                Blocking;
                blockersStarted.countDown();
                this_thread::sleep_for(500ms);
                blockers.countDown();
            });
        }

        for (unsigned i = 0; i < N; i++)
            async([&]() {
                fn();
                remaining.countDown();
            });

        // to check the pool is grown we need to be sure blockers were all started:
        blockersStarted.wait();
        REQUIRE(pool.countThreads() == N+nBlockers);

        auto tn = bm([&]() {
            remaining.wait();
        });

        auto ratio = double(tn) / t1;
//        cout << N << " time " << tn << " : " << ratio << endl;
        // some of these cores are hyperthreads, not cores, so the ratio will be non ideal
        REQUIRE(ratio < 1.75);
        // and now there should be no extra threads anymore
        blockers.wait();
        REQUIRE(pool.countThreads() == N);
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

        Latch blocker(1);
        RValueTestClass t;
        async([&blocker,t{move(t)}](){
            t.printSomething();
            blocker.countDown();
        });
        blocker.wait();
        cout << "copyCounter: " << copyCounter << endl;
        cout << "moveCounter: " << moveCounter << endl;
        REQUIRE(copyCounter == 0);
        REQUIRE(moveCounter == 3);
    }
}
