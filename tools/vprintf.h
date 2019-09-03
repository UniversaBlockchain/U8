/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_ZPRINTF_H
#define U8_ZPRINTF_H

#include <string>

const std::string vsformat(const char *const format, va_list args);

const std::string sformat(const char *const format, ...);

void zprintf(const char *const format, ...);

#endif //U8_ZPRINTF_H
