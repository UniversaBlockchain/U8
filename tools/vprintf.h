//
// Created by Sergey Chernov on 2019-01-26.
//

#ifndef U8_ZPRINTF_H
#define U8_ZPRINTF_H

#include <string>

const std::string vsformat(const char *const format, va_list args);

const std::string sformat(const char *const format, ...);

void zprintf(const char *const format, ...);

#endif //U8_ZPRINTF_H
