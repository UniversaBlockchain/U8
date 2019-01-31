//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include <cstring>

#include "async_io_bindings.h"
#include "binding_tools.h"
#include "../tools/tools.h"
#include "../AsyncIO/AsyncIO.h"

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
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOHandle>(args.This());
        auto scripter = ac.scripter;

        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, ac.as<Function>(1));

        // avoid copying results
        auto max_size = ac.asInt(0);
        auto ab = ArrayBuffer::New(ac.isolate, max_size);
        auto pResult = new Persistent<Uint8Array>(ac.isolate, Uint8Array::New(ab, 0, max_size));

        handle->read(ab->GetContents().Data(), max_size,
                     [=](ssize_t result) {
                         // here we are in another thread
                         scripter->lockedContext([=](auto context) {
                             Isolate *isolate = context->GetIsolate();
                             auto fn = pcb->Get(isolate);
                             if (fn->IsNull()) {
                                 scripter->throwError("null callback in IoHandle::read");
                             } else {
                                 if (result > 0) {
                                     Local<Value> res[2]{pResult->Get(isolate), Integer::New(isolate, result)};
                                     fn->Call(fn, 2, res);
                                 } else {
                                     Local<Value> res[] = {Undefined(isolate), Integer::New(isolate, result)};
                                     fn->Call(fn, 2, res);
                                 }
                             }
                             delete pcb;
                             delete pResult;
                         });
                     });
    });
}

// write(typedArray,cb)
void JsAsyncHandleWrite(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOHandle>(args.This());
        auto scripter = ac.scripter;

        auto source = ac.as<TypedArray>(0);
        auto size = source->Length();
        auto bytes = (uint8_t *) source->Buffer()->GetContents().Data();

//        cout << "write " << size << " bytes: " << vector<int>(bytes, bytes + size) << endl;

        auto fn = ac.as<Function>(1);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in IoHandle::write");
            return;
        }
        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, fn);

        // We'll need it with a shared buffer
        auto pResult = new Persistent<TypedArray>(ac.isolate, source);

        handle->write(bytes, size,
                      [=](ssize_t result) {
                          // here we are in another thread
                          scripter->lockedContext([=](auto context) {
                              Isolate *isolate = context->GetIsolate();
                              auto fn = pcb->Get(isolate);
                              Local<Value> res = Integer::New(isolate, result);
                              fn->Call(fn, 1, &res);
                              delete pcb;
                              delete pResult;
                          });
                      });
    });
}

void JsAsyncHandleClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOHandle>(args.This());
        auto scripter = ac.scripter;

        auto fn = ac.as<Function>(0);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in IoHandle::close");
            return;
        }
        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, fn);

        handle->close([=](ssize_t result) {
                          // here we are in another thread
                          scripter->lockedContext([=](auto context) {
                              Isolate *isolate = context->GetIsolate();
                              auto fn = pcb->Get(isolate);
                              Local<Value> res = Integer::New(isolate, result);
                              fn->Call(fn, 1, &res);
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
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    global->Set(isolate, "IoHandle", tpl);
}


