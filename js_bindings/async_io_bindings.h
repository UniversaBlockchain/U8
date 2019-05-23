//
// Created by Sergey Chernov on 2019-01-05.
//

#ifndef U8_ASYNC_IO_BINDINGS_H
#define U8_ASYNC_IO_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitIOFile(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitIOTCP(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitIOTLS(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitIOUDP(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitIODir(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_ASYNC_IO_BINDINGS_H
