/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "worker_bindings.h"

class ScripterWrap {
public:
    std::shared_ptr<Scripter> se;
};

static const std::string workerMain = R"End(
function __worker_on_receive(obj) {
    console.log("__worker_on_receive: hit!");
}
)End";

static void JsCreateWorker(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto se = ac.scripter;
            int accessLevel = ac.asInt(0);
            auto onComplete = ac.asFunction(1);
            runAsync([se, onComplete]() {
                ScripterWrap *psw = new ScripterWrap();
                psw->se = Scripter::New();
                //psw->se->startMainLoopThread();
//                v8::Isolate::Scope isolateScope(psw->se->isolate());
//                psw->se->evaluate(workerMain);
//                psw->se->evaluate("__worker_on_receive();");
//                psw->se->inContext([se,psw](Local<Context> cxt) {
//                    cout << "eva1" << endl;
//                    psw->se->evaluate("console.log('print something 1');");
//                });
//                this_thread::sleep_for(3s);
//                psw->se->evaluate("console.log('print something 0');");
//                psw->se->exit(0);
//                psw->se->joinMainLoopThread();
//                this_thread::sleep_for(100ms);
                cout << "onComplete..." << endl;
                onComplete->lockedContext([=](Local<Context> cxt) {
                    cout << "JsCreateWorker onComplete" << endl;
                    Local<Value> res = wrap(*se->getTemplate("ScripterWrapTpl"), cxt->GetIsolate(), psw);
                    onComplete->invoke(move(res));
                    //onComplete->invoke();
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

//void JsScripterWrap_eval(const FunctionCallbackInfo<Value> &args) {
//    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
//        if (ac.args.Length() == 4) {
//            return;
//        }
//        ac.throwError("invalid number of arguments");
//    });
//}

void JsInitScripterWrap(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<ScripterWrap>(isolate, "ScripterWrap");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
//    prototype->Set(isolate, "_eval", FunctionTemplate::New(isolate, JsScripterWrap_eval));

    // register it into global namespace
    auto persistentTpl = std::make_shared<Persistent<FunctionTemplate>>();
    persistentTpl->Reset(isolate, tpl);
    scripter.setTemplate("ScripterWrapTpl", persistentTpl);
    global->Set(isolate, "ScripterWrap", tpl);
}
