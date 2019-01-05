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
    v8::Isolate *isolate = args.GetIsolate();
    v8::HandleScope handle_scope(isolate);

    auto ext = isolate->GetEnteredContext()->GetEmbedderData(1);
    v8::Local<v8::External> wrap = v8::Local<v8::External>::Cast(ext);
    ScriptEnvironment *se = static_cast<ScriptEnvironment *>(wrap->Value());

    v8::Local<v8::Array> result = v8::Array::New(isolate);

    v8::String::Utf8Value v8str(isolate, args[0]);

    string sourceName = *v8::String::Utf8Value(isolate, args[0]);
    string name = se->resolveRequiredFile(sourceName);

    // If it is empty we just return empty array
    if (!name.empty()) {
//        auto resultV8Str =
//                v8::String::NewFromUtf8(isolate, loadAsString(name).c_str(), v8::NewStringType::kNormal)
//                        .ToLocalChecked();
        result->Set(result->Length(), v8::String::NewFromUtf8(isolate, name.c_str()) );
        result->Set(result->Length(), v8::String::NewFromUtf8(isolate, loadAsString(name).c_str()) );
    }
    args.GetReturnValue().Set(result);
}



