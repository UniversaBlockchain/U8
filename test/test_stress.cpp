#include "catch2.h"
#include "../tools/StressTestTools.h"

TEST_CASE("Stress_Queue") {
    stressQueueTest<QueueMultiGrinder>();
}

TEST_CASE("Stress_QueueAndPool") {
    stressQueueTest<QueuePoolGrinder>();
}
