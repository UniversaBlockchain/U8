//
// Created by Sergey Chernov on 2019-01-05.
//
#include <iostream>
#include <cstring>

#include "async_io_bindings.h"
#include "binding_tools.h"
#include "../tools/tools.h"
#include "../AsyncIO/IOFile.h"
#include "../AsyncIO/IOTCP.h"
#include "../AsyncIO/IOTLS.h"

static Persistent<FunctionTemplate> FileTemplate;
static Persistent<FunctionTemplate> TCPTemplate;
static Persistent<FunctionTemplate> TLSTemplate;
static Persistent<FunctionTemplate> UDPTemplate;


void JsAsyncGetErrorText(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> &se, auto isolate, auto context) {
        // args is typicalli big int, so we convert it through string
        auto code = stol(se->getString(args[0]));
        auto text = se->v8String(asyncio::getError(code));
        args.GetReturnValue().Set(text);
    });
}

void JsAsyncFileOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> &se, auto isolate, auto context) {
        auto file_name = se->getString(args[0]);
        auto mode = se->getString(args[1]);
        auto h = unwrap<asyncio::IOFile>(args.This());
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
                        se->throwError("null callback in IOFile::open");
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

         handle->read(pdata, max_size, [=](ssize_t result) {
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
    });
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

        handle->write(bytes, size, [=](ssize_t result) {
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

// TCP listen      0            1                   2                          3
// void open(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections);
void JsAsyncTCPListen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 4) {
            if (!ac.args[2]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOTCP>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(2));
            int maxConnections = ac.asInt(3);
            if (maxConnections <= 0) maxConnections = SOMAXCONN;
            handle->open(ac.asString(0).data(), ac.asInt(1), [=](ssize_t result) {
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
void JsAsyncTCPConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 5) {
            if (!ac.args[4]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOTCP>(args.This());
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
void JsAsyncTCPAccept(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 1) {
            auto obj = ac.as<Object>(0);
            auto tpl = TCPTemplate.Get(ac.isolate);
            if (!obj->IsObject() || !tpl->HasInstance(obj)) {
                ac.throwError("required IOTCP argument");
            } else {
                auto connectionHandle = unwrap<asyncio::IOTCP>(obj);
                auto serverHandle = unwrap<asyncio::IOTCP>(args.This());
                int code = serverHandle->acceptFromListeningSocket(connectionHandle);
                ac.setReturnValue(code);
            };
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

//void open(const char* IP, unsigned int port, const char* certFilePath, const char* keyFilePath,
//          openTCP_cb callback, int maxConnections = SOMAXCONN);
void JsAsyncTLSListen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 6) {
            if (!ac.args[4]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOTLS>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(4));
            int maxConnections = ac.asInt(5);
            if (maxConnections <= 0) maxConnections = SOMAXCONN;
            handle->open(ac.asString(0).data(), ac.asInt(1),ac.asString(2).data(),ac.asString(3).data(), [=](ssize_t result) {
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

//void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port,
//             const char* certFilePath, const char* keyFilePath, connect_cb callback, unsigned int timeout = 5000);
void JsAsyncTLSConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 8) {
            if (!ac.args[6]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }
            auto handle = unwrap<asyncio::IOTLS>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(6));
            auto bindIp = ac.asString(0);
            auto bindPort = ac.asInt(1);
            auto connectToHost = ac.asString(2);
            auto connectToPort = ac.asInt(3);
            auto timeout = ac.asInt(7);

            handle->connect(bindIp.data(), bindPort, connectToHost.data(), connectToPort, ac.asString(4).data(), ac.asString(5).data(), [=](ssize_t result) {
                scripter->lockedContext([=](auto context) {
                    auto fn = onReady->Get(isolate);
                    delete onReady;
                    Local<Value> jsResult = Integer::New(isolate, result);
                    fn->Call(fn, 1, &jsResult);
                });
            }, timeout);
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

//int acceptFromListeningSocket(IOTLS* listenSocket, accept_cb callback, unsigned int timeout);
//typedef std::function<void(IOTLS* handle, ssize_t result)> accept_cb;
void JsAsyncTLSAccept(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 3) {
            if (!ac.args[1]->IsFunction()) {
                scripter->throwError("invalid callback");
                return;
            }

            auto obj = ac.as<Object>(0);
            auto tpl = TLSTemplate.Get(ac.isolate);
            if (!obj->IsObject() || !tpl->HasInstance(obj)) {
                ac.throwError("required IOTLS argument");
                return;
            }

            auto serverHandle = unwrap<asyncio::IOTLS>(args.This());
            auto isolate = ac.isolate;
            Persistent<Function> *onReady = new Persistent<Function>(ac.isolate, ac.as<Function>(1));
            auto connectionHandle = unwrap<asyncio::IOTLS>(obj);
            auto timeout = ac.asInt(2);
            int code = serverHandle->acceptFromListeningSocket(connectionHandle, [=](asyncio::IOTLS* handle, ssize_t result) {
                scripter->lockedContext([=](auto context) {
                    auto fn = onReady->Get(isolate);
                    delete onReady;
                    Local<Value> jsResult = Integer::New(isolate, result);
                    fn->Call(fn, 1, &jsResult);
                });
            }, timeout);
            ac.setReturnValue(code);
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

// UDP open         0                1
// void open(const char* IP, unsigned int port)
void JsAsyncUDPOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 2) {
            auto handle = unwrap<asyncio::IOUDP>(args.This());
            int code = handle->open(ac.asString(0).data(), ac.asInt(1));
            ac.setReturnValue(code);
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

// UDP recv         0                1                      2
// void recv(void* buffer, size_t maxBytesToRecv, recvBuffer_cb callback)
void JsAsyncUDPRecv(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOUDP>(args.This());
        auto scripter = ac.scripter;

        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, ac.as<Function>(0));

        args.This()->Set(String::NewFromUtf8(ac.isolate, "_pcb"), BigInt::NewFromUnsigned(ac.isolate, (uint64_t) pcb));

        handle->recv([=](ssize_t result, const byte_vector& data, const char* IP, unsigned int port) {
            // here we are in the async dispatcher thread we should not lock:
            scripter->inPool([=](auto context) {
                Isolate *isolate = context->GetIsolate();
                auto fn = pcb->Get(isolate);
                if (fn->IsNull() || fn->IsUndefined()) {
                    scripter->throwError("null callback in IOUDP::recv");
                } else {
                    if (result > 0) {
                        auto ab = ArrayBuffer::New(isolate, data.size());
                        unsigned char *pdata = (unsigned char *) ab->GetContents().Data();

                        memcpy(pdata, data.data(), data.size());

                        auto pResult = new Persistent<Uint8Array>(isolate, Uint8Array::New(ab, 0, data.size()));
                        // not sure whether we actually need it:
                        auto pBuffer = new Persistent<ArrayBuffer>(isolate, ab);

                        Local<Value> res[4]{pResult->Get(isolate), Integer::New(isolate, result),
                                            String::NewFromUtf8(isolate, IP), Integer::New(isolate, port)};
                        fn->Call(fn, 4, res);

                        delete pResult;
                        delete pBuffer;
                    } else {
                        Local<Value> res[] = {Undefined(isolate), Integer::New(isolate, result),
                                              Undefined(isolate), Undefined(isolate)};
                        fn->Call(fn, 4, res);
                    }
                }
                // delete after stopping recv:
                //delete pcb;
            });
        });
    });
}

// UDP send         0            1             2                 3               4
// void send(void* buffer, size_t size, const char* IP, unsigned int port, send_cb callback)
void JsAsyncUDPSend(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOUDP>(args.This());
        auto scripter = ac.scripter;

        auto source = ac.as<TypedArray>(0);
        auto buffer =  source->Buffer();
        auto size = buffer->ByteLength();
        auto bytes = (uint8_t *) buffer->GetContents().Data();

        auto fn = ac.as<Function>(3);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in IOUDP::send");
            return;
        }
        Persistent<Function> *pcb = new Persistent<Function>(ac.isolate, fn);

        // We'll need it with a shared buffer
        auto pBuffer = new Persistent<ArrayBuffer>(ac.isolate, source->Buffer());

        handle->send(bytes, size, ac.asString(1).data(), ac.asInt(2), [=](ssize_t result) {
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

void deleteUDPRecvPersistent(const FunctionCallbackInfo<Value> &args, const ArgsContext &ac) {
    Local<Value> pcb = args.This()->Get(String::NewFromUtf8(ac.isolate, "_pcb"));
    if (!pcb->IsNullOrUndefined()) {
        delete (Persistent<Function>*) pcb->ToBigInt(ac.context).ToLocalChecked()->Uint64Value();
        args.This()->Set(String::NewFromUtf8(ac.isolate, "_pcb"), Undefined(ac.isolate));
    }
}

// UDP stopRecv
void JsAsyncUDPStopRecv(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto scripter = ac.scripter;
        if (args.Length() == 0) {
            auto handle = unwrap<asyncio::IOUDP>(args.This());
            handle->stopRecv();

            // delete recv persistent
            deleteUDPRecvPersistent(args, ac);
        } else {
            scripter->throwError("invalid number of arguments");
        }
    });
}

void JsAsyncUDPClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        auto handle = unwrap<asyncio::IOHandle>(args.This());
        auto scripter = ac.scripter;

        auto fn = ac.as<Function>(0);
        if (fn->IsNull() || fn->IsUndefined()) {
            scripter->throwError("null callback in IOUDP::close");
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

        // delete recv persistent
        deleteUDPRecvPersistent(args, ac);
    });
}

void JsInitIOFile(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOFile>(isolate, "IOFile");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncFileOpen));
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    FileTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOFile", tpl);
}

void JsInitIOTCP(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOTCP>(isolate, "IOTCP");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));
    prototype->Set(isolate, "_listen", FunctionTemplate::New(isolate, JsAsyncTCPListen));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsAsyncTCPConnect));
    prototype->Set(isolate, "_accept", FunctionTemplate::New(isolate, JsAsyncTCPAccept));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    TCPTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOTCP", tpl);
}

void JsInitIOTLS(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOTLS>(isolate, "IOTLS");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));
    prototype->Set(isolate, "_listen", FunctionTemplate::New(isolate, JsAsyncTLSListen));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsAsyncTLSConnect));
    prototype->Set(isolate, "_accept", FunctionTemplate::New(isolate, JsAsyncTLSAccept));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    TLSTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOTLS", tpl);
}

void JsInitIOUDP(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOUDP>(isolate, "IOUDP");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "_open", FunctionTemplate::New(isolate, JsAsyncUDPOpen));
    prototype->Set(isolate, "_recv", FunctionTemplate::New(isolate, JsAsyncUDPRecv));
    prototype->Set(isolate, "_send", FunctionTemplate::New(isolate, JsAsyncUDPSend));
    prototype->Set(isolate, "_stop_recv", FunctionTemplate::New(isolate, JsAsyncUDPStopRecv));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncUDPClose));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    UDPTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOUDP", tpl);
}
