//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include <sstream>
#include "binding_tools.h"
#include "basic_builtins.h"
#include "../tools/tools.h"

using namespace std;

void JsPrint(const v8::FunctionCallbackInfo<v8::Value> &args) {
    auto isolate = args.GetIsolate();
    bool isError = args[0]->BooleanValue(isolate);
    ostringstream ss;

    bool first = true;
    for (int i = 1; i < args.Length(); i++) {
        v8::HandleScope handle_scope(args.GetIsolate());
        if (first) {
            first = false;
        } else {
            ss << ' ';
        }
        v8::String::Utf8Value str(args.GetIsolate(), args[i]->ToString(args.GetIsolate()));
        const char *cstr = *str;
        ss << (cstr ? cstr : "(undefined)");
    }
    auto message = ss.str();
    jsThreadPool([=](){
        (isError ? cerr : cout) << message;
    });
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
            result->Set(result->Length(), se->v8String(name));
            result->Set(result->Length(), se->v8String(loadAsString(name)));
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
            se->lockedContext([=](Local<Context> &context) {
                // get the local hadnle to function from persistent handle
                auto fn = jsCallback->Get(context->GetIsolate());
                // call it using the function as the this context:
                fn->Call(fn, 0, nullptr);
                // now we must free the persistent handle as it is single operation
                jsCallback->Reset();
//                delete jsCallback;
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
            args.GetReturnValue().Set(
                    v8::Local(v8::Function::New(isolate, JsTimer))
            );
        }
    });
}

void JsWaitExit(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](auto se, auto isolate, auto context) {
        se->setWaitExit();
    });
}

void JsExit(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](shared_ptr<Scripter> se, auto isolate, auto context) {
        se->exit(args[0]->Uint32Value(context).FromJust());
    });
}

void JsTypedArrayToString(const FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](shared_ptr<Scripter> se, auto isolate, auto context) {
        if (!args[0]->IsTypedArray())
            se->throwError("must be a typed array");
        Local<Uint8Array> array = args[0].As<Uint8Array>();
        args.GetReturnValue().Set(
                String::NewFromUtf8(isolate,
                                    (const char *) array->Buffer()->GetContents().Data(),
                                    NewStringType::kNormal,
                                    array->Length()
                ).ToLocalChecked());
    });
}

void JsStringToTypedArray(const FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        String::Utf8Value s(ac.isolate, args[0]->ToString(ac.isolate));
        args.GetReturnValue().Set(ac.toBinary(*s, s.length()));
    });
}



