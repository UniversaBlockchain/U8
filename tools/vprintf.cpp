/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <thread>
#include <vector>
#include <iostream>
#include <mutex>
#include <stdarg.h>

#include "vprintf.h"

static std::mutex vfmx;


const std::string vsformat(const char *const format, va_list args) {
    // initialize use of the variable argument array
    va_list argsCopy;
    va_copy(argsCopy, args);
    const int length = std::vsnprintf(NULL, 0, format, argsCopy);
    va_end(argsCopy);

    std::vector<char> buffer(length + 1);
    std::vsnprintf(buffer.data(), buffer.size(), format, args);

    return std::string(buffer.data(), length);
}

const std::string sformat(const char *const format, ...) {
    // initialize use of the variable argument array
    va_list args;
    va_start(args, format);
    std::string result = vsformat(format, args);
    va_end(args);
    return result;
}

void zprintf(const char *const format, ...) {
    std::unique_lock lock(vfmx);
    va_list args;
    va_start(args, format);
    std::cout << vsformat(format, args) << std::endl;
    va_end(args);

}





