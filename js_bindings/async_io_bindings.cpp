//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>

#include "async_io_bindings.h"
#include "weak_finalizers.h"
#include "../tools/tools.h"
#include "../AsyncIO.h"

template <class T>
T* unwrap(const Local<Object>& obj) {
    Local<External> wrap = Local<External>::Cast(obj->GetInternalField(0));
    return static_cast<T*>(wrap->Value());
}

void JsAsyncGetErrorText(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> &se, auto isolate, auto context) {
        // args is typicalli big int, so we convert it through string
        auto code = stol(se->getString(args[0]));
        auto text = se->v8String(asyncio::getError(code));
        args.GetReturnValue().Set(text);
    });
}

void JsAsyncHandleOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> &se, auto isolate, auto context) {
        auto file_name = se->getString(args[0]);
        auto mode = se->getString(args[1]);
        auto h = unwrap<asyncio::IOHandle>(args.This());
        Persistent<Function> *pcb = new Persistent<Function>(isolate, args[3].As<Function>());

        cout << "handle " << h << ": open" << file_name << " " << mode << endl;
        int openMode = -1;
        if( mode == "r" ) {
            openMode = O_RDONLY;
        }
        else if( mode == "w" ) {
            openMode = O_WRONLY | O_CREAT | O_TRUNC;
        }
        else if( mode == "rw" || mode == "wr" ) {
            openMode = O_RDWR | O_CREAT;
        }
        else if( mode == "a" ) {
            openMode = O_APPEND | O_CREAT;
        }

        int umask = (int) args[2]->IntegerValue(context).FromJust();

        if(openMode >= 0) {
            h->open(file_name.data(),openMode,umask,[=](auto result) {
                se->lockedContext([=](Local<Context>& context) {
                    auto fn = pcb->Get(context->GetIsolate());
                    if( fn->IsNull() ) {
                        se->throwError("null callback in IoHandle::open");
                    }
                    else {
                        Local<Value> res = BigInt::New(isolate, result);
                        fn->Call(fn, 1, &res);
                    }
                });
            });
        }
        else {
            se->throwError("unknown mode: "+mode);
        }

        args.GetReturnValue().SetNull();
    });
}


void IoHandleConstructor(const FunctionCallbackInfo<Value> &args) {
    auto isolate = args.GetIsolate();
    if (!args.IsConstructCall()) {
        isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "calling constructor as function")));
    } else {
        asyncio::IOHandle *handle = new asyncio::IOHandle();
        cout << "created new" << handle << endl;
        Local<Object> result = args.This();// Local<ObjectTemplate>::New(isolate, io_handle_template);
        result->SetInternalField(0, External::New(isolate, handle));
        SimpleFinalizer(result, handle);
        args.GetReturnValue().Set(args.This());
    }
}

void JsInitIoHandle(Isolate *isolate, const Local<ObjectTemplate> &global) {
    auto name = String::NewFromUtf8(isolate, "IoHandle");
    Local<FunctionTemplate> tpl = FunctionTemplate::New(isolate, IoHandleConstructor);
    tpl->InstanceTemplate()->SetInternalFieldCount(1);
    tpl->SetClassName(name);

    // create protptype here
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncHandleOpen));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    global->Set(name, tpl);
}


