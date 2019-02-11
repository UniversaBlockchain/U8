//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include <cstring>

#include "async_io_bindings.h"
#include "binding_tools.h"
#include "../tools/tools.h"
#include "../AsyncIO/AsyncIO.h"

static Persistent<FunctionTemplate> handleTemplate;

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
                se->inPool([=](Local<Context> &context) {
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
                             unsigned char *pdata = (unsigned char *) ab->GetContents().Data();
                             auto pResult = new Persistent<Uint8Array>(ac.isolate, Uint8Array::New(ab, 0, max_size));
                             // not sure whether we actually need it:
                             auto pBuffer = new Persistent<ArrayBuffer>(ac.isolate, ab);

                             handle->read(pdata, max_size,
                                          [=](ssize_t result) {
                                              // here we are in the async dispatcher thread we should not lock:
                                              scripter->inPool([=](auto context) {
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
                                                  delete pBuffer;
                                              });
                                          });
                         }

    );
}

// write(typedArray,cb)
void JsAsyncHandleWrite(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOHandle>(args.This());
        auto scripter = ac.scripter;

        auto source = ac.as<TypedArray>(0);
        auto buffer =  source->Buffer();
        auto size = buffer->ByteLength();
        auto bytes = (uint8_t *) buffer->GetContents().Data();

        auto fn = ac.as<Function>(1);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in IoHandle::write");
            return;
        }
        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, fn);

        // We'll need it with a shared buffer
        auto pBuffer = new Persistent<ArrayBuffer>(ac.isolate, source->Buffer());

        handle->write(bytes, size,
                      [=](ssize_t result) {
                          // here we are in another thread
                          scripter->inPool([=](auto context) {
                              Isolate *isolate = context->GetIsolate();
                              auto fn = pcb->Get(isolate);
                              Local<Value> res = Integer::New(isolate, result);
                              fn->Call(fn, 1, &res);
                              delete pcb;
                              delete pBuffer;
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
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = pcb->Get(isolate);
                Local<Value> res = Integer::New(isolate, result);
                fn->Call(fn, 1, &res);
                delete pcb;
            });
        });
    });
}

// TCP listen         0            1                   2                          3
// void openTCP(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections);
void JsAsyncHandleListen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 4) {
            if (!ac.args[2]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOHandle>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(2));
            int maxConnections = ac.asInt(3);
            if (maxConnections <= 0) maxConnections = SOMAXCONN;
            handle->openTCP(ac.asString(0).data(), ac.asInt(1), [=](ssize_t result) {
                scripter->lockedContext([=](auto context) {
                    auto fn = onReady->Get(isolate);
                    delete onReady;
                    Local<Value> jsResult = Integer::New(isolate, result);
                    fn->Call(fn, 1, &jsResult);
                });
            }, maxConnections);
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

//                       0                     1                 2                3              4
// void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback);
void JsAsyncHandleConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 5) {
            if (!ac.args[4]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOHandle>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(4));
            auto bindIp = ac.asString(0);
            auto bindPort = ac.asInt(1);
            auto connectToHost = ac.asString(2);
            auto connectToPort = ac.asInt(3);

            handle->connect(bindIp.data(), bindPort, connectToHost.data(), connectToPort, [=](ssize_t result) {
                scripter->lockedContext([=](auto context) {
                    auto fn = onReady->Get(isolate);
                    delete onReady;
                    Local<Value> jsResult = Integer::New(isolate, result);
                    fn->Call(fn, 1, &jsResult);
                });
            });
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

// accept(serverHandle)
void JsAsyncHandleAccept(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 1) {
            auto obj = ac.as<Object>(0);
            auto tpl = handleTemplate.Get(ac.isolate);
            if (!obj->IsObject() || !tpl->HasInstance(obj)) {
                ac.throwError("required IoHandle argument");
            } else {
                auto connectionHandle = unwrap<asyncio::IOHandle>(obj);
                auto serverHandle = unwrap<asyncio::IOHandle>(args.This());
                int code = serverHandle->acceptFromListeningSocket(connectionHandle);
                ac.setReturnValue(code);
            };
        } else {
            scripter->throwError("invalid number of arguments");
        }
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
    prototype->Set(isolate, "_listen", FunctionTemplate::New(isolate, JsAsyncHandleListen));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsAsyncHandleConnect));
    prototype->Set(isolate, "_accept", FunctionTemplate::New(isolate, JsAsyncHandleAccept));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    handleTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IoHandle", tpl);
}


