//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>

#include "async_io_bindings.h"
#include "binding_tools.h"
#include "../tools/tools.h"
#include "../AsyncIO/AsyncIO.h"

using asyncio::byte_vector;

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

        int openMode = -1;
        if (mode == "r") {
            openMode = O_RDONLY;
        } else if (mode == "w") {
            openMode = O_WRONLY | O_CREAT | O_TRUNC;
        } else if (mode == "rw" || mode == "wr") {
            openMode = O_RDWR | O_CREAT;
        } else if (mode == "a") {
            openMode = O_APPEND | O_CREAT;
        }

        int umask = (int) args[2]->IntegerValue(context).FromJust();

        if (openMode >= 0) {
            h->open(file_name.data(), openMode, umask, [=](auto result) {
                se->lockedContext([=](Local<Context> &context) {
                    auto fn = pcb->Get(context->GetIsolate());
                    if (fn->IsNull()) {
                        se->throwError("null callback in IoHandle::open");
                    } else {
                        Local<Value> res = BigInt::New(isolate, result);
                        fn->Call(fn, 1, &res);
                    }
                    delete pcb;
                });
            });
        } else {
            se->throwError("unknown mode: " + mode);
        }

        args.GetReturnValue().SetNull();
    });
}

void JsAsyncHandleRead(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> &se, auto isolate, auto context) {
        auto handle = unwrap<asyncio::IOHandle>(args.This());
        Persistent<Function> *pcb = new Persistent<Function>(isolate, args[1].As<Function>());
        handle->read(
                args[0]->Int32Value(context).FromJust(),
                [=](const byte_vector &data, ssize_t result) {

                    se->lockedContext([&](auto context) {

                        Isolate* isolate = context->GetIsolate();
                        auto fn = pcb->Get(isolate);

                        if (fn->IsNull()) {
                            se->throwError("null callback in IoHandle::read");
                        } else {
                            if( result > 0 ) {
                                Local<ArrayBuffer> ab = ArrayBuffer::New(isolate, result);
                                memcpy(ab->GetContents().Data(), data.data(), result);
                                Local<Value> res[2] {Uint8Array::New(ab, 0, result), Integer::New(isolate, result)};
                                fn->Call(fn, 2, res);
                            }
                            else {
                                Local<Value> res[] = {Undefined(isolate), Integer::New(isolate, result)};
                                fn->Call(fn, 2, res);
                            }
                        }
                        delete pcb;

                    });
                });
    });
}


void JsInitIoHandle(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOHandle>(isolate, "IoHandle");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncHandleOpen));
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    global->Set(isolate, "IoHandle", tpl);
}


