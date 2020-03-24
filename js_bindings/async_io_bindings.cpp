/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <iostream>
#include <cstring>
#include "zip.h"

#include "async_io_bindings.h"
#include "binding_tools.h"
#include "../tools/tools.h"
#include "../tools/Semaphore.h"
#include "../AsyncIO/IOFile.h"
#include "../AsyncIO/IODir.h"
#include "../AsyncIO/IOTCP.h"
#include "../AsyncIO/IOTLS.h"

extern std::string BASE_PATH;                          // path to ZIP-module or directory where jslib found
extern const char *U8MODULE_EXTENSION;

void JsAsyncGetErrorText(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        // args is typically big int, so we convert it through string
        auto code = stol(ac.asString(0));
        auto text = ac.scripter->v8String(asyncio::getError(code));
        ac.args.GetReturnValue().Set(text);
    });
}

void JsAsyncStatMode(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto path = ac.asString(0);
        auto onReady = ac.asFunction(1);

        asyncio::IOFile::stat(path.data(), [=](asyncio::ioStat stat, ssize_t result) {
            // here we are in the async dispatcher thread we should not lock;
            // lockedContext is just put task to its internal queue
            onReady->lockedContext([=](Local<Context> &cxt){
                Local<Value> res[2];
                if (result >= 0)
                    res[0] = Integer::New(cxt->GetIsolate(), stat.st_mode);
                else
                    res[0] = Undefined(cxt->GetIsolate());
                res[1] = Integer::New(cxt->GetIsolate(), result);
                onReady->invoke(2, res);
            });
        });
    });
}

void JsAsyncFileRemove(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto file_path = ac.asString(0);
        auto onReady = ac.asFunction(1);

        asyncio::IOFile::remove(file_path.data(), [=](auto result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });

        ac.args.GetReturnValue().SetNull();
    });
}

void JsAsyncFileOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto file_name = ac.asString(0);
        auto mode = ac.asString(1);
        auto h = unwrap<asyncio::IOFile>(ac.args.This());
        auto onReady = ac.asFunction(3);

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

        int umask = (int) ac.asLong(2);

        if (openMode >= 0) {
            h->open(file_name.data(), openMode, umask, [=](auto result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    Local<Value> res;
                    if (result < 0)
                        res = Integer::New(cxt->GetIsolate(), result);
                    else
                        res = BigInt::New(cxt->GetIsolate(), result);
                    onReady->invoke(std::move(res));
                });
            });
        } else {
            ac.throwError("unknown mode: " + mode);
        }

        ac.args.GetReturnValue().SetNull();
    });
}

void JsAsyncHandleRead(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {

        auto handle = unwrap<asyncio::IOHandle>(ac.args.This());

        auto onReady = ac.asFunction(1);

        // avoid copying results
        auto max_size = ac.asInt(0);
        auto ab = ArrayBuffer::New(ac.isolate, max_size);
        unsigned char *pdata = (unsigned char *) ab->GetContents().Data();
        auto pResult = new Persistent<Uint8Array>(ac.isolate, Uint8Array::New(ab, 0, max_size));
        // not sure whether we actually need it:
        auto pBuffer = new Persistent<ArrayBuffer>(ac.isolate, ab);

        handle->read(pdata, max_size, [=](ssize_t result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                if (result > 0) {
                  Local<Value> res[2]{pResult->Get(cxt->GetIsolate()), Integer::New(cxt->GetIsolate(), result)};
                  onReady->invoke(2, res);
                } else {
                  Local<Value> res[] = {Undefined(cxt->GetIsolate()), Integer::New(cxt->GetIsolate(), result)};
                  onReady->invoke(2, res);
                }
                pResult->Reset();
                pBuffer->Reset();
                delete pResult;
                delete pBuffer;
            });
         });
    });
}

// write(typedArray,cb)
void JsAsyncHandleWrite(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto handle = unwrap<asyncio::IOHandle>(ac.args.This());
        auto pData = ac.asBuffer(0);
        auto onReady = ac.asFunction(1);
        handle->write(pData->data(), pData->size(), [=](ssize_t result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });
    });
}

void JsAsyncHandleClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto handle = unwrap<asyncio::IOHandle>(ac.args.This());
        auto onReady = ac.asFunction(0);
        handle->close([=](ssize_t result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });
    });
}

// TCP listen      0            1                   2                          3
// void open(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections);
void JsAsyncTCPListen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto handle = unwrap<asyncio::IOTCP>(ac.args.This());
            auto onReady = ac.asFunction(2);
            int maxConnections = ac.asInt(3);
            if (maxConnections <= 0) maxConnections = SOMAXCONN;
            handle->open(ac.asString(0).data(), ac.asInt(1), [=](ssize_t result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(Integer::New(cxt->GetIsolate(), result));
                });
            }, maxConnections);
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

//                       0                     1                 2                3              4
// void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback);
void JsAsyncTCPConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 5) {
            auto handle = unwrap<asyncio::IOTCP>(ac.args.This());
            auto onReady = ac.asFunction(4);
            auto bindIp = ac.asString(0);
            auto bindPort = ac.asInt(1);
            auto connectToHost = ac.asString(2);
            auto connectToPort = ac.asInt(3);
            handle->connect(bindIp.data(), bindPort, connectToHost.data(), connectToPort, [=](ssize_t result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(Integer::New(cxt->GetIsolate(), result));
                });
            });
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

// accept(serverHandle)
void JsAsyncTCPAccept(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto obj = ac.as<Object>(0);
            auto tpl = ac.scripter->TCPTemplate.Get(ac.isolate);
            if (!obj->IsObject() || !tpl->HasInstance(obj)) {
                ac.throwError("required IOTCP argument");
            } else {
                auto connectionHandle = unwrap<asyncio::IOTCP>(obj);
                auto serverHandle = unwrap<asyncio::IOTCP>(ac.args.This());
                int code = serverHandle->acceptFromListeningSocket(connectionHandle);
                ac.setReturnValue(code);
            }
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

//void open(const char* IP, unsigned int port, const char* certFilePath, const char* keyFilePath,
//          openTCP_cb callback, int maxConnections = SOMAXCONN);
void JsAsyncTLSListen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 6) {
            auto handle = unwrap<asyncio::IOTLS>(ac.args.This());
            auto onReady = ac.asFunction(4);
            int maxConnections = ac.asInt(5);
            if (maxConnections <= 0) maxConnections = SOMAXCONN;
            handle->open(ac.asString(0).data(), ac.asInt(1),ac.asString(2).data(),ac.asString(3).data(), [=](ssize_t result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(Integer::New(cxt->GetIsolate(), result));
                });
            }, maxConnections);
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

//void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port,
//             const char* certFilePath, const char* keyFilePath, connect_cb callback, unsigned int timeout = 5000);
void JsAsyncTLSConnect(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 8) {
            auto handle = unwrap<asyncio::IOTLS>(ac.args.This());
            auto onReady = ac.asFunction(6);
            auto bindIp = ac.asString(0);
            auto bindPort = ac.asInt(1);
            auto connectToHost = ac.asString(2);
            auto connectToPort = ac.asInt(3);
            auto timeout = ac.asInt(7);

            handle->connect(bindIp.data(), bindPort, connectToHost.data(), connectToPort, ac.asString(4).data(), ac.asString(5).data(), [=](ssize_t result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(Integer::New(cxt->GetIsolate(), result));
                });
            }, timeout);
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

//int acceptFromListeningSocket(IOTLS* listenSocket, accept_cb callback, unsigned int timeout);
//typedef std::function<void(IOTLS* handle, ssize_t result)> accept_cb;
void JsAsyncTLSAccept(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto obj = ac.as<Object>(0);
            auto tpl = ac.scripter->TLSTemplate.Get(ac.isolate);
            if (!obj->IsObject() || !tpl->HasInstance(obj)) {
                ac.throwError("required IOTLS argument");
                return;
            }

            auto serverHandle = unwrap<asyncio::IOTLS>(ac.args.This());
            auto onReady = ac.asFunction(1);
            auto connectionHandle = unwrap<asyncio::IOTLS>(obj);
            auto timeout = ac.asInt(2);
            int code = serverHandle->acceptFromListeningSocket(connectionHandle, [=](asyncio::IOTLS* handle, ssize_t result) {
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(Integer::New(cxt->GetIsolate(), result));
                });
            }, timeout);
            ac.setReturnValue(code);
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

class IOUDPWrapper: public asyncio::IOUDP {
public:
    shared_ptr<FunctionHandler> recvCallback_ = nullptr;
};

void JsAsyncUDPOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto handle = unwrap<IOUDPWrapper>(ac.args.This());
            int code = handle->open(ac.asString(0).data(), ac.asInt(1));
            ac.setReturnValue(code);
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

void JsAsyncUDPRecv(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto handle = unwrap<IOUDPWrapper>(ac.args.This());
        auto onRecv = ac.asFunction(0);

        handle->recvCallback_ = onRecv;

        handle->recv([=](ssize_t result, const byte_vector& data, const char* IP, unsigned int port) {
            std::string strIP = IP;
            auto sem = make_shared<Semaphore>();

            // here we are in the async dispatcher thread we should not lock:
            onRecv->lockedContext([=](Local<Context> &cxt){
                if (result > 0) {
                    auto ab = ArrayBuffer::New(cxt->GetIsolate(), data.size());
                    unsigned char *pdata = (unsigned char *) ab->GetContents().Data();

                    memcpy(pdata, data.data(), data.size());

                    auto pResult = new Persistent<Uint8Array>(cxt->GetIsolate(), Uint8Array::New(ab, 0, data.size()));
                    // not sure whether we actually need it:
                    auto pBuffer = new Persistent<ArrayBuffer>(cxt->GetIsolate(), ab);

                    Local<Value> res[4]{pResult->Get(cxt->GetIsolate()), Integer::New(cxt->GetIsolate(), result),
                                        String::NewFromUtf8(cxt->GetIsolate(), strIP.data()).ToLocalChecked(), Integer::New(cxt->GetIsolate(), port)};
                    onRecv->invoke(4, res);

                    pResult->Reset();
                    pBuffer->Reset();
                    delete pResult;
                    delete pBuffer;
                } else {
                    Local<Value> res[] = {Undefined(cxt->GetIsolate()), Integer::New(cxt->GetIsolate(), result),
                                          Undefined(cxt->GetIsolate()), Undefined(cxt->GetIsolate())};
                    onRecv->invoke(4, res);
                }
                sem->notify();
            });

            if (!sem->wait(1s))
                ac.scripter->throwError("IOUDP::recv callback timeout");
        });
    });
}

void JsAsyncUDPSend(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto handle = unwrap<IOUDPWrapper>(ac.args.This());
        auto pData = ac.asBuffer(0);
        auto onReady = ac.asFunction(3);

        handle->send(pData->data(), pData->size(), ac.asString(1).data(), ac.asInt(2), [=](ssize_t result) {
            // here we are in another thread
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });
    });
}

// UDP stopRecv
void JsAsyncUDPStopRecv(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto handle = unwrap<IOUDPWrapper>(ac.args.This());
            handle->stopRecv();

            // delete recv persistent
            handle->recvCallback_ = nullptr;
        } else {
            ac.throwError("invalid number of arguments");
        }
    });
}

void JsAsyncUDPClose(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto handle = unwrap<asyncio::IOHandle>(ac.args.This());
        auto onReady = ac.asFunction(0);

        handle->close([=](ssize_t result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });

        // delete recv persistent
        IOUDPWrapper* maybeUdp = dynamic_cast<IOUDPWrapper*>(handle);
        if (maybeUdp)
            ((IOUDPWrapper *) handle)->recvCallback_ = nullptr;
    });
}

void JsInitIOFile(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOFile>(isolate, "IOFile");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncFileOpen));
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));
    tpl->Set(isolate, "stat_mode", FunctionTemplate::New(isolate, JsAsyncStatMode));
    tpl->Set(isolate, "remove", FunctionTemplate::New(isolate, JsAsyncFileRemove));

    // register it into global namespace
    scripter.FileTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOFile", tpl);
}

void JsInitIOTCP(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOTCP>(isolate, "IOTCP");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));
    prototype->Set(isolate, "_listen", FunctionTemplate::New(isolate, JsAsyncTCPListen));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsAsyncTCPConnect));
    prototype->Set(isolate, "_accept", FunctionTemplate::New(isolate, JsAsyncTCPAccept));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    scripter.TCPTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOTCP", tpl);
}

void JsInitIOTLS(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IOTLS>(isolate, "IOTLS");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));
    prototype->Set(isolate, "_listen", FunctionTemplate::New(isolate, JsAsyncTLSListen));
    prototype->Set(isolate, "_connect", FunctionTemplate::New(isolate, JsAsyncTLSConnect));
    prototype->Set(isolate, "_accept", FunctionTemplate::New(isolate, JsAsyncTLSAccept));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    scripter.TLSTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOTLS", tpl);
}

void JsInitIOUDP(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<IOUDPWrapper>(isolate, "IOUDP");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    prototype->Set(isolate, "_open", FunctionTemplate::New(isolate, JsAsyncUDPOpen));
    prototype->Set(isolate, "_recv", FunctionTemplate::New(isolate, JsAsyncUDPRecv));
    prototype->Set(isolate, "_send", FunctionTemplate::New(isolate, JsAsyncUDPSend));
    prototype->Set(isolate, "_stop_recv", FunctionTemplate::New(isolate, JsAsyncUDPStopRecv));
    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncUDPClose));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    scripter.UDPTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IOUDP", tpl);
}

void JsAsyncDirOpen(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto dir_path = ac.asString(0);
        auto h = unwrap<asyncio::IODir>(ac.args.This());
        auto onReady = ac.asFunction(1);

        h->open(dir_path.data(), [=](auto result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });

        ac.args.GetReturnValue().SetNull();
    });
}

void JsAsyncDirNext(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto h = unwrap<asyncio::IODir>(ac.args.This());

        asyncio::ioDirEntry entry;
        if (h->next(&entry)) {
            v8::Local<v8::Array> result = v8::Array::New(ac.isolate);

            auto unused = result->Set(ac.context, result->Length(), ac.scripter->v8String(entry.name));

            unsigned int type = 2;
            if (asyncio::isFile(entry))
                type = 0;
            else if (asyncio::isDir(entry))
                type = 1;

            auto unused2 = result->Set(ac.context, result->Length(), Integer::New(ac.isolate, type));

            ac.args.GetReturnValue().Set(result);
        } else
            ac.args.GetReturnValue().SetNull();
    });
}

void JsAsyncDirCreate(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto dir_path = ac.asString(0);
        auto onReady = ac.asFunction(1);

        asyncio::IODir::createDir(dir_path.data(), S_IRWXU | S_IRGRP | S_IXGRP | S_IROTH | S_IXOTH, [=](auto result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });

        ac.args.GetReturnValue().SetNull();
    });
}

void JsAsyncDirRemove(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        auto dir_path = ac.asString(0);
        auto onReady = ac.asFunction(1);

        asyncio::IODir::removeDir(dir_path.data(), [=](auto result) {
            onReady->lockedContext([=](Local<Context> &cxt){
                onReady->invoke(Integer::New(cxt->GetIsolate(), result));
            });
        });

        ac.args.GetReturnValue().SetNull();
    });
}

void JsInitIODir(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<asyncio::IODir>(isolate, "IODir");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncDirOpen));
    prototype->Set(isolate, "next", FunctionTemplate::New(isolate, JsAsyncDirNext));

    // class methods
    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));
    tpl->Set(isolate, "create", FunctionTemplate::New(isolate, JsAsyncDirCreate));
    tpl->Set(isolate, "remove", FunctionTemplate::New(isolate, JsAsyncDirRemove));

    // register it into global namespace
    scripter.DirTemplate.Reset(isolate, tpl);
    global->Set(isolate, "IODir", tpl);
}

void JsZip_getBasePath(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            ac.setReturnValue(ac.v8String(BASE_PATH));
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsZip_getModuleResourcesFromPath(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto path = ac.asString(0);

            size_t pos = path.find(U8MODULE_EXTENSION);
            if (pos == std::string::npos) {
                ac.throwError("path without zip-module");
                return;
            }

            string zipPath = path.substr(0, pos + 4);
            string dir = path.substr(pos + 5);

            int err = 0;
            zip* z = zip_open(zipPath.c_str(), 0, &err);
            if (z == nullptr) {
                ac.throwError("failed opening zip-module");
                return;
            }

            auto expected = dir.length();
            if (dir.rfind("/") == expected - 1)
                expected--;

            v8::Local<v8::Array> result = v8::Array::New(ac.isolate);
            auto count = zip_get_num_entries(z, 0);

            for (zip_uint64_t i = 0; i < count; i++) {
                string name = zip_get_name(z, i, 0);
                pos = name.rfind("/");
                if (name.find(dir) == 0 && pos == expected) {
                    string fileName = name.substr(pos + 1);
                    if (!fileName.empty())
                        auto unused = result->Set(ac.context, result->Length(), ac.v8String(fileName));
                }
            }

            zip_close(z);

            ac.setReturnValue(result);
            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsZip_readResourceContentsAsString(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto path = ac.asString(0);

            size_t pos = path.find(U8MODULE_EXTENSION);
            if (pos == std::string::npos) {
                ac.throwError("path without zip-module");
                return;
            }

            string zipPath = path.substr(0, pos + 4);
            string fileName = path.substr(pos + 5);

            auto data = loadFromZip(zipPath, fileName);
            if (data.empty()) {
                ac.throwError("error loading file from zip-module");
                return;
            }

            ac.setReturnValue(ac.v8String(data));

            return;
        }
        ac.throwError("invalid number of arguments");
    });
}

void JsInitZipBindings(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();
    global->Set(String::NewFromUtf8(isolate, "getBasePath").ToLocalChecked(), FunctionTemplate::New(isolate, JsZip_getBasePath));
    global->Set(String::NewFromUtf8(isolate, "getModuleResourcesFromPath").ToLocalChecked(), FunctionTemplate::New(isolate, JsZip_getModuleResourcesFromPath));
    global->Set(String::NewFromUtf8(isolate, "readResourceContentsAsString").ToLocalChecked(), FunctionTemplate::New(isolate, JsZip_readResourceContentsAsString));
}