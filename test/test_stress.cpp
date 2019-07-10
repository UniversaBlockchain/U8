#include "catch2.h"
#include "../tools/StressTestTools.h"

TEST_CASE("Stress_Queue") {
    stressQueueTest<QueueMultiGrinder>(135);
}

TEST_CASE("Stress_QueueAndPool") {
    stressQueueTest<QueuePoolGrinder>(135);
}
