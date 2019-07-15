//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include <sstream>
#include "binding_tools.h"
#include "basic_builtins.h"
#include "../tools/tools.h"
#include "../tools/StreamPump.h"

using namespace std;

// We want to avoid destructing of these pump with application shutdown as it causes
// problems with stdlib++ as for now:
StreamPump *cout_pump = new StreamPump(cout);
StreamPump *cerr_pump = new StreamPump(cerr);

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
    *(isError ? cerr_pump : cout_pump) << message;
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
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // resetTimer( millis, callback)
        // callback function must persist context change, so we need a persistent handle
        auto callback = ac.asFunction(1);
        auto se = ac.scripter;
        se->asyncSleep.delay(ac.asLong(0), [callback,se]() {
            // We need to re-enter in context as we are in another thread and stack, and as we do
            // it from another thread, we MUST use lockedContext:
            se->lockedContext([callback, se](Local<Context> &context) {
                callback->invoke();
            });
        });
    });
}

void JsInitTimers(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrap(args, [&](auto se, v8::Isolate *isolate, auto context) {
        se->log("CALLED TIMERS INIT");
        if (se->timersReady()) {
            se->log_e("SR timers already initialized");
        } else {
            // timer process should be initialized and function returned
            auto foo = v8::Function::New(isolate->GetCurrentContext(), JsTimer);
            v8::Local<Function> local;
            if (foo.ToLocal(&local))
                args.GetReturnValue().Set(local);
            else
                se->log_e("ToLocal returns false");
        }
    });
}

void JsExit(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext& ac) {
        ac.scripter->exit(ac.asLong(0));
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



