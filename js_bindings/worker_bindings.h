/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_WORKER_BINDINGS_H
#define U8_WORKER_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void InitWorkerPools(int accessLevel0_poolSize, int accessLevel1_poolSize);

void JsInitWorkerBindings(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitWorkerScripter(Scripter& scripter, const Local<ObjectTemplate> &global);

void JsInitWorkers(const v8::FunctionCallbackInfo<v8::Value> &args);
void JsSendFromWorker(const v8::FunctionCallbackInfo<v8::Value> &args);

#endif //U8_WORKER_BINDINGS_H
