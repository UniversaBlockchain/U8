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
    std::shared_ptr<std::thread> loopThread;
};

static const std::string workerMain = R"End(
function piSpigot(iThread, n) {
    let piIter = 0;
    let pi = new ArrayBuffer(n);
    let boxes = Math.floor(n * 10 / 3);
    let reminders = new ArrayBuffer(boxes);
    for (let i = 0; i < boxes; ++i)
        reminders[i] = 2;
    let heldDigits = 0;
    for (let i = 0; i < n; ++i) {
        let carriedOver = 0;
        let sum = 0;
        for (let j = boxes - 1; j >= 0; --j) {
            reminders[j] *= 10;
            sum = reminders[j] + carriedOver;
            let quotient = Math.floor(sum / (j*2 + 1));
            reminders[j] = sum % (j*2 + 1);
            carriedOver = quotient * j;
        }
        reminders[0] = sum % 10;
        let q = Math.floor(sum / 10);
        if (q == 9) {
            ++heldDigits;
        } else if (q == 10) {
            q = 0;
            for (let k = 1; k <= heldDigits; ++k) {
                let replaced = pi[i-k];
                if (replaced == 9)
                    replaced = 0;
                else
                    ++replaced;
                pi[i-k] = replaced;
            }
            heldDigits = 1;
        } else {
            heldDigits = 1;
        }
        pi[piIter++] = q;
    }
    let s = "";
    for (let i = piIter - 8; i < piIter; ++i)
        s += ""+pi[i];
    console.log(iThread + ": " + s);
}

__init_workers((obj) => {
    console.log("worker onReceive: " + JSON.stringify(obj));
    piSpigot(obj.a, obj.b);
});
)End";

static void JsCreateWorker(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto se = ac.scripter;
            int accessLevel = ac.asInt(0);
            auto onComplete = ac.asFunction(1);
            runAsync([se, onComplete]() {
                WorkerScripter *psw = new WorkerScripter();
                Semaphore sem;
                psw->loopThread = std::make_shared<std::thread>([psw,&sem]() {
                    psw->se = Scripter::New();
                    psw->se->isolate()->SetData(1, psw);
                    psw->se->evaluate(workerMain);
                    sem.notify();
                    psw->se->runMainLoop();
                });
                sem.wait();
                onComplete->lockedContext([=](Local<Context> cxt) {
                    Local<Value> res = wrap(*se->getTemplate("WorkerScripterTpl"), cxt->GetIsolate(), psw);
                    onComplete->invoke(move(res));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");

    });
}

void JsInitWorkerBindings(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global) {
    JsInitScripterWrap(scripter, isolate, global);

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
                    auto v8obj = obj.serializeToV8(*onReceive->scripter(), onReceive->scripter()->isolate());
                    onReceive->invoke(v8obj);
                });
            });
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsInitScripterWrap(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<WorkerScripter>(isolate, "WorkerScripter");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_send", FunctionTemplate::New(isolate, JsScripterWrap_send));

    // register it into global namespace
    auto persistentTpl = std::make_shared<Persistent<FunctionTemplate>>();
    persistentTpl->Reset(isolate, tpl);
    scripter.setTemplate("WorkerScripterTpl", persistentTpl);
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
