//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include "basic_builtins.h"
#include "tools.h"

using namespace std;

void JsPrint(const v8::FunctionCallbackInfo<v8::Value> &args) {
    bool first = true;
    for (int i = 0; i < args.Length(); i++) {
        v8::HandleScope handle_scope(args.GetIsolate());
        if (first) {
            first = false;
        } else {
            cout << endl;
        }
        v8::String::Utf8Value str(args.GetIsolate(), args[i]);
        const char *cstr = *str;
        cout << (cstr ? cstr : "(undefined)");
    }
    cout << endl;
}

//void withScriptEnv(std::function<void(v8::Isolate*,))

void JsLoadRequired(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](auto se, auto isolate, auto context) {
        v8::Local<v8::Array> result = v8::Array::New(isolate);
        v8::String::Utf8Value v8str(isolate, args[0]);

        string sourceName = *v8::String::Utf8Value(isolate, args[0]);
        string name = se->resolveRequiredFile(sourceName);

        // If it is empty we just return empty array
        if (!name.empty()) {
            result->Set(result->Length(), v8::String::NewFromUtf8(isolate, name.c_str()));
            result->Set(result->Length(), v8::String::NewFromUtf8(isolate, loadAsString(name).c_str()));
        }
        args.GetReturnValue().Set(result);
    });
}

void JsTimer(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](auto se, auto isolate, auto context) {
        // resetTimer( millis, callback)
        long millis = args[0].As<v8::Integer>()->Value();
        // callback function must persist context change, so we need a persistent handle
        auto jsCallback = new v8::Persistent<v8::Function>(isolate, args[1].As<v8::Function>());
        se->asyncSleep.delay(millis, [=]() {
            // We need to re-enter in context as we are in another thread and stack, and as we do
            // it from another thread, we MUST use lockedContext:
            se->lockedContext([=](auto context) {
                // get the local hadnle to function from persistent handle
                auto fn = jsCallback->Get(context->GetIsolate());
                // call it using the function as the this context:
                fn->Call(fn, 0, nullptr);
                // now we must free the persistent handle as it is single operation
                jsCallback->Reset();
            });
        });
    });
}

void JsInitTimers(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](auto se, auto isolate, auto context) {
        se->log("CALLED TIMERS INIT");
        if (se->timersReady()) {
            se->log_e("SR timers already initialized");
        } else {
            // timer process should be initialized and function returned
            se->initTimer();
            args.GetReturnValue().Set(
                    v8::Local(v8::Function::New(isolate, JsTimer))
            );
        }
    });
}



