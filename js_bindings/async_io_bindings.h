//
// Created by Sergey Chernov on 2019-01-05.
//

#ifndef U8_ASYNC_IO_BINDINGS_H
#define U8_ASYNC_IO_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitIoHandle(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_ASYNC_IO_BINDINGS_H
