/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "catch2.h"
#include "../tools/StressTestTools.h"

TEST_CASE("Stress_Queue") {
    stressQueueTest<QueueMultiGrinder>(3);
}

TEST_CASE("Stress_QueueAndPool") {
    stressQueueTest<QueuePoolGrinder>(3);
}
