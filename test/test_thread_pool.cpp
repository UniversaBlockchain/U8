//
// Created by Sergey Chernov on 2019-01-27.
//

#include "catch2.h"
#include "../tools/ThreadPool.cpp"

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
                if( i == 1 ) this_thread::sleep_for(5ms);
            });
        }
        REQUIRE(pool.queueSize() > 1);
        this_thread::sleep_for(100ms);
        REQUIRE(count == valid_count);
        REQUIRE(sum == valid_sum);
    }
}



