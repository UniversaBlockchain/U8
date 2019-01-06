//
// Created by Sergey Chernov on 2019-01-05.
//

#ifndef U8_BASIC_BUILTINS_H
#define U8_BASIC_BUILTINS_H

#include "Scripter.h"

void JsPrint(const v8::FunctionCallbackInfo<v8::Value> &args);

void JsLoadRequired(const v8::FunctionCallbackInfo<v8::Value> &args);

void JsInitTimers(const v8::FunctionCallbackInfo<v8::Value> &args);


#endif //U8_BASIC_BUILTINS_H
