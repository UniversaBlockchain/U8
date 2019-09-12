/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "worker_bindings.h"
#include "../types/UObject.h"
#include "../types/TypesFactory.h"
#include "../tools/Semaphore.h"

class WorkerScripter {
public:
    std::shared_ptr<Scripter> se;
    std::shared_ptr<FunctionHandler> onReceive;
    std::shared_ptr<FunctionHandler> onReceiveMain;
    std::shared_ptr<std::thread> loopThread;
};

static const std::string workerMain = R"End(
__init_workers(async (obj) => {
    if (wrk.onReceive)
        await wrk.onReceive(obj);
});
wrk.send = (obj) => {
    __send_from_worker(obj);
};
)End";

static void JsCreateWorker(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto se = ac.scripter;
            int accessLevel = ac.asInt(0);
            auto workerSrc = ac.asString(1);
            auto onComplete = ac.asFunction(2);
            runAsync([workerSrc, se, onComplete]() {
                WorkerScripter *psw = new WorkerScripter();
                Semaphore sem;
                psw->loopThread = std::make_shared<std::thread>([workerSrc,psw,&sem]() {
                    psw->se = Scripter::New();
                    psw->se->isolate()->SetData(1, psw);
                    psw->se->evaluate(workerMain);
                    psw->se->evaluate(workerSrc);
                    sem.notify();
                    psw->se->runMainLoop();
                });
                sem.wait();
                onComplete->lockedContext([=](Local<Context> cxt) {
                    Local<Value> res = wrap(se->WorkerScripterTpl, cxt->GetIsolate(), psw);
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

    wrk->Set(isolate, "__createWorker", FunctionTemplate::New(isolate, JsCreateWorker));

    global->Set(isolate, "wrk", wrk);
}

void JsScripterWrap_send(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto psw = unwrap<WorkerScripter>(ac.args.This());
            UObject obj = v8ValueToUObject(ac.isolate, ac.args[0]);
            auto onReceive = psw->onReceive;
            auto se = ac.scripter;
            runAsync([onReceive,se,obj{move(obj)}](){
                onReceive->lockedContext([onReceive,obj{move(obj)}](Local<Context> &cxt){
                    auto v8obj = obj.serializeToV8(onReceive->scripter_sp());
                    onReceive->invoke(v8obj);
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
            auto psw = unwrap<WorkerScripter>(ac.args.This());
            psw->onReceiveMain = ac.asFunction(0);
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

    // register it into global namespace
    scripter.WorkerScripterTpl.Reset(isolate, tpl);
    global->Set(isolate, "WorkerScripter", tpl);
}

void JsInitWorkers(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto se = ac.scripter;
            auto isolate = ac.isolate;
            auto psw = (WorkerScripter*)isolate->GetData(1);
            auto func = ac.asFunction(0);
            psw->onReceive = func;
            return;
        }
        ac.throwError("invalid number of arguments");
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
