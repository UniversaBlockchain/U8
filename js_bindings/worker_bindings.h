/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_WORKER_BINDINGS_H
#define U8_WORKER_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitWorkerBindings(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitScripterWrap(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_WORKER_BINDINGS_H
