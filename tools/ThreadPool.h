/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_THREADPOOL_H
#define U8_THREADPOOL_H


#include <functional>
#include <thread>
#include "Queue.h"
#include "tools.h"

#include "FixedThreadPool.h"

class ThreadPool : public FixedThreadPool {
    using FixedThreadPool::FixedThreadPool;//(size_t, int);
};

#endif //U8_THREADPOOL_H
