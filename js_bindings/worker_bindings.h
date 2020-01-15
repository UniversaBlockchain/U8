/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_WORKER_BINDINGS_H
#define U8_WORKER_BINDINGS_H

#include "Scripter.h"
#include "../tools/Semaphore.h"

using namespace v8;
using namespace std;

class WorkerScripter {
public:
    int id;
    int accessLevel;
    clockid_t clockId;
    std::string jsWorkerSrc;
    std::shared_ptr<Scripter> se;
    std::shared_ptr<FunctionHandler> onReceive;
    std::shared_ptr<FunctionHandler> onGetWorker;
    std::shared_ptr<FunctionHandler> onReceiveMain; // receiver is parent scripter
    std::shared_ptr<FunctionHandler> onLowMemoryMain; // receiver is parent scripter
    std::shared_ptr<std::thread> loopThread;
    std::unordered_map<std::string, std::string> customJsLibFiles;
    std::shared_ptr<Semaphore> pauseOnLowMemory = std::make_shared<Semaphore>();
};

void InitWorkerPools(int accessLevel0_poolSize, int accessLevel1_poolSize);

void JsInitWorkerBindings(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitWorkerScripter(Scripter& scripter, const Local<ObjectTemplate> &global);

void JsInitWorkers(const v8::FunctionCallbackInfo<v8::Value> &args);
void JsSendFromWorker(const v8::FunctionCallbackInfo<v8::Value> &args);
void JsRequireFromWorker(const v8::FunctionCallbackInfo<v8::Value> &args);

#endif //U8_WORKER_BINDINGS_H
