/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "worker_bindings.h"
#include "../types/UObject.h"
#include "../types/UBinder.h"
#include "../types/UString.h"
#include "../types/TypesFactory.h"
#include "../tools/Semaphore.h"
#include <unordered_map>
#include <stdio.h>
#include <pthread.h>
#include <time.h>

class WorkerScripter {
public:
    int id;
    int accessLevel;
    clockid_t clockId;
    std::string jsWorkerSrc;
    std::shared_ptr<Scripter> se;
    std::shared_ptr<FunctionHandler> onReceive;
    std::shared_ptr<FunctionHandler> onGetWorker;
    std::shared_ptr<FunctionHandler> onReceiveMain;
    std::shared_ptr<std::thread> loopThread;
    std::unordered_map<std::string, std::string> customJsLibFiles;
};

static bool workersPool_isInit = false;
static std::mutex workersPool_accessLevel0_mutex;
std::condition_variable workersPool_accessLevel0_cv;
static std::list<shared_ptr<WorkerScripter>> workersPool_accessLevel0;
static std::unordered_map<int, shared_ptr<WorkerScripter>> workersPool_accessLevel0_used;
static std::mutex workersPool_accessLevel1_mutex;
std::condition_variable workersPool_accessLevel1_cv;
static std::list<shared_ptr<WorkerScripter>> workersPool_accessLevel1;
static std::unordered_map<int, shared_ptr<WorkerScripter>> workersPool_accessLevel1_used;

static const std::string workerMain = R"End(
let wrkInner = {};

__init_workers(async (src, obj) => {
    // this context can be used for something critical to the execution of source.methodName
    // so we isolate it:
    return (function() {
        // This is a non-safe calling function context, but it is local
        // and will be garbaged on exit

        // interpret source
        eval(src);
        // create caller for the methodName
        let wrap = eval(`(obj) => { return ${"wrkInner.onReceive"}(obj); }`);
        // call it safely
        return wrap(obj)
    })();

}, () => {
    // onGetWorker event
    wrkInner.export = {};
    wrkInner.nextFarcallSN = 0;
    wrkInner.callbacksFarcall = new Map();
    wrkInner.onReceive = (obj) => {};
    wrkInner.getNextFarcallSN = () => {
        let res = wrkInner.nextFarcallSN;
        ++wrkInner.nextFarcallSN;
        if (wrkInner.nextFarcallSN >= Number.MAX_SAFE_INTEGER)
            wrkInner.nextFarcallSN = 0;
        return res;
    };
});

wrkInner.send = (obj) => {
    __send_from_worker(obj);
};

freezeGlobals();
)End";

void InitWorkerPools(int accessLevel0_poolSize, int accessLevel1_poolSize) {
    {
        std::lock_guard lock0(workersPool_accessLevel0_mutex);
        std::lock_guard lock1(workersPool_accessLevel1_mutex);
        if (!workersPool_isInit) {
            workersPool_isInit = true;
            for (int i = 0; i < accessLevel0_poolSize; ++i) {
                auto pws = std::make_shared<WorkerScripter>();
                pws->id = i;
                pws->accessLevel = 0;
                Semaphore sem;
                pws->loopThread = std::make_shared<std::thread>([pws, &sem]() {
                    pws->se = Scripter::New(0);
                    pws->se->isolate()->SetData(1, pws.get());
                    pws->se->evaluate(workerMain);
                    sem.notify();
                    pws->se->runMainLoop(true);
                });
                pthread_getcpuclockid(pws->loopThread->native_handle() , &pws->clockId);
                sem.wait();
                workersPool_accessLevel0.push_back(pws);
            }
            for (int i = 0; i < accessLevel1_poolSize; ++i) {
                auto pws = std::make_shared<WorkerScripter>();
                pws->id = i;
                pws->accessLevel = 1;
                Semaphore sem;
                pws->loopThread = std::make_shared<std::thread>([pws, &sem]() {
                    pws->se = Scripter::New(1);
                    pws->se->isolate()->SetData(1, pws.get());
                    pws->se->evaluate(workerMain);
                    sem.notify();
                    pws->se->runMainLoop(true);
                });
                pthread_getcpuclockid(pws->loopThread->native_handle() , &pws->clockId);
                sem.wait();
                workersPool_accessLevel1.push_back(pws);
            }
        }
    }
}

static shared_ptr<WorkerScripter> GetWorker(int accessLevel) {
    std::mutex* mtx = nullptr;
    std::condition_variable* cv = nullptr;
    decltype(workersPool_accessLevel0)* pool = nullptr;
    decltype(workersPool_accessLevel0_used)* poolUsed = nullptr;
    if (accessLevel == 0) {
        mtx = &workersPool_accessLevel0_mutex;
        cv = &workersPool_accessLevel0_cv;
        pool = &workersPool_accessLevel0;
        poolUsed = &workersPool_accessLevel0_used;
    } else if (accessLevel == 1) {
        mtx = &workersPool_accessLevel1_mutex;
        cv = &workersPool_accessLevel1_cv;
        pool = &workersPool_accessLevel1;
        poolUsed = &workersPool_accessLevel1_used;
    }
    if (mtx == nullptr)
        return nullptr;

    std::unique_lock lock(*mtx);
    while (pool->empty())
        cv->wait(lock);
    auto pws = pool->front();
    pool->pop_front();
    (*poolUsed)[pws->id] = pws;

//    if (pws->accessLevel == 1) {
//        timespec ts;
//        clock_gettime(pws->clockId, &ts);
//        printf("___GetWorker %i: %i:%i\n", pws->id, ts.tv_sec, ts.tv_nsec);
//    }

    return pws;
}

static void ReleaseWorker(WorkerScripter* pws) {

//    if (pws->accessLevel == 1) {
//        timespec ts;
//        clock_gettime(pws->clockId, &ts);
//        printf("___ReleaseWorker %i: %i:%i\n", pws->id, ts.tv_sec, ts.tv_nsec);
//    }

    int accessLevel = pws->accessLevel;
    std::mutex* mtx = nullptr;
    std::condition_variable* cv = nullptr;
    decltype(workersPool_accessLevel0)* pool = nullptr;
    decltype(workersPool_accessLevel0_used)* poolUsed = nullptr;
    if (accessLevel == 0) {
        mtx = &workersPool_accessLevel0_mutex;
        cv = &workersPool_accessLevel0_cv;
        pool = &workersPool_accessLevel0;
        poolUsed = &workersPool_accessLevel0_used;
    } else if (accessLevel == 1) {
        mtx = &workersPool_accessLevel1_mutex;
        cv = &workersPool_accessLevel1_cv;
        pool = &workersPool_accessLevel1;
        poolUsed = &workersPool_accessLevel1_used;
    }
    if (mtx == nullptr)
        return;

    std::lock_guard lock(*mtx);
    if (poolUsed->find(pws->id) != poolUsed->end()) {
        auto w = (*poolUsed)[pws->id];
        pool->push_back(w);
        poolUsed->erase(pws->id);
        cv->notify_one();
    }
}

void extractCustomJsLibFiles(const UObject& obj, unordered_map<string,string>& dest) {
    try {
        const UBinder& binder = UBinder::asInstance(obj);
        for (auto k : binder) {
            const UString& fileSrc = UString::asInstance(k.second);
            dest[k.first] = fileSrc.get();
        }
    } catch (const std::exception& e) {
        // can't parse, do nothing. Library files would be missing, without errors in ubot
    }
}

static void JsGetWorker(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto se = ac.scripter;
            int accessLevel = ac.asInt(0);
            if (se->getSelfAcceccLevel() > accessLevel) {
                ac.throwError("Your worker's access level is " + to_string(se->getSelfAcceccLevel()) +
                              ", you can't create worker with access level " + to_string(accessLevel));
                return;
            }
            auto workerSrc = ac.asString(1);
            auto onComplete = ac.asFunction(2);
            UObject customJsLibFiles = v8ValueToUObject(ac.isolate, ac.args[3]);
            runAsync([accessLevel, workerSrc, onComplete, customJsLibFiles{move(customJsLibFiles)}]() {
                Blocking;
                auto w = GetWorker(accessLevel);
                w->customJsLibFiles.clear();
                extractCustomJsLibFiles(customJsLibFiles, w->customJsLibFiles);
                Semaphore sem;
                w->onGetWorker->lockedContext([w,&sem](auto cxt){
                    w->onGetWorker->invoke();
                    sem.notify();
                });
                sem.wait();
                w->jsWorkerSrc = workerSrc;
                onComplete->lockedContext([=](Local<Context> cxt) {
                    Local<Value> res = wrap(onComplete->scripter()->WorkerScripterTpl, cxt->GetIsolate(), w.get());
                    onComplete->invoke(move(res));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");

    });
}

void JsInitWorkerBindings(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    JsInitWorkerScripter(scripter, global);

    auto wrk = ObjectTemplate::New(isolate);

    wrk->Set(isolate, "__getWorker", FunctionTemplate::New(isolate, JsGetWorker));

    global->Set(isolate, "wrkImpl", wrk);
}

void JsScripterWrap_send(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto psw = unwrap<WorkerScripter>(ac.args.This());
            UObject obj = v8ValueToUObject(ac.isolate, ac.args[0]);
            auto onReceive = psw->onReceive;
            auto se = ac.scripter;
            runAsync([psw,onReceive,se,obj{move(obj)}](){
                onReceive->lockedContext([psw,onReceive,obj{move(obj)}](Local<Context> &cxt){
                    auto src = Local<Object>::Cast(String::NewFromUtf8(onReceive->scripter()->isolate(), psw->jsWorkerSrc.data()));
                    auto v8obj = obj.serializeToV8(onReceive->scripter_sp());
                    Local<Value> args[2] {src, v8obj};
                    onReceive->invoke(2, args);
                });
            });
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsScripterWrap_setOnReceive(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto pws = unwrap<WorkerScripter>(ac.args.This());
            pws->onReceiveMain = ac.asFunction(0);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsScripterWrap_release(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            bool terminateRequired = ac.args[0]->BooleanValue(ac.context).FromJust();
            auto pws = unwrap<WorkerScripter>(ac.args.This());
            if (terminateRequired)
                pws->onReceive->isolate()->TerminateExecution();
            ReleaseWorker(pws);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsScripterWrap_getProcessorTime(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto pws = unwrap<WorkerScripter>(ac.args.This());

            timespec ts;
            clock_gettime(pws->clockId, &ts);
            double time = ts.tv_sec + (double) ts.tv_nsec / 1000000000;

            ac.setReturnValue(time);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsInitWorkerScripter(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();
    
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<WorkerScripter>(isolate, "WorkerScripter");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_send", FunctionTemplate::New(isolate, JsScripterWrap_send));
    prototype->Set(isolate, "_setOnReceive", FunctionTemplate::New(isolate, JsScripterWrap_setOnReceive));
    prototype->Set(isolate, "_release", FunctionTemplate::New(isolate, JsScripterWrap_release));
    prototype->Set(isolate, "_getProcessorTime", FunctionTemplate::New(isolate, JsScripterWrap_getProcessorTime));

    // register it into global namespace
    scripter.WorkerScripterTpl.Reset(isolate, tpl);
    global->Set(isolate, "WorkerScripter", tpl);
}

void JsInitWorkers(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (!ac.scripter->isWorkersReady()) {
            ac.scripter->setWorkersReady();
            if (ac.args.Length() == 2) {
                auto se = ac.scripter;
                auto isolate = ac.isolate;
                auto psw = (WorkerScripter *) isolate->GetData(1);
                psw->onReceive = ac.asFunction(0);
                psw->onGetWorker = ac.asFunction(1);
                return;
            }
            ac.throwError("invalid number of arguments");
        } else {
            ac.throwError("workers already initialized");
        }
    });
}

void JsSendFromWorker(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            UObject obj = v8ValueToUObject(ac.isolate, ac.args[0]);
            WorkerScripter* pws = (WorkerScripter*)ac.isolate->GetData(1);
            auto onReceiveMain = pws->onReceiveMain;
            onReceiveMain->lockedContext([onReceiveMain,obj](auto cxt){
                auto v8obj = obj.serializeToV8(onReceiveMain->scripter_sp());
                onReceiveMain->invoke(v8obj);
            });
            return;
        }
        auto se = ac.scripter;
        se->lockedContext([se](auto cxt){
            se->throwException("invalid number of arguments");
        });
    });
}

void JsRequireFromWorker(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto fileName = ac.asString(0);
            WorkerScripter* pws = (WorkerScripter*)ac.isolate->GetData(1);
            if (pws->customJsLibFiles.find(fileName) != pws->customJsLibFiles.end()) {
                const std::string& fileSrc = pws->customJsLibFiles[fileName];
                ac.setReturnValue(Local<Object>::Cast(String::NewFromUtf8(ac.isolate, fileSrc.data())));
                return;
            }
            ac.setReturnValue(Local<Object>::Cast(Null(ac.isolate)));
            return;
        }
        auto se = ac.scripter;
        se->lockedContext([se](auto cxt){
            se->throwException("invalid number of arguments");
        });
    });
}
