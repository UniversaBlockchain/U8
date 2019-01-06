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
    Scripter::inContext(args, [&](auto se, auto isolate, auto context) {
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
    cout << "TIMER CB CALLED!" << endl;
}

void JsInitTimers(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::inContext(args, [&](auto se, auto isolate, auto context) {
        cout << "CALLED TIMERS INIT" << endl;
        if (se->timersReady()) {
            cerr << "SR timers already initialized" << endl;
        } else {
            // timer process should be initialized and function returned
            se->initTimer();
            args.GetReturnValue().Set(
                    v8::Local(v8::Function::New(isolate, JsTimer))
            );
        }
    });
}



