//
// Created by Leonid Novikov on 4/8/19.
//

#include "udp_bindings.h"
#include "binding_tools.h"
#include "../network/HttpServer.h"
#include "../network/UDPAdapter.h"

using namespace network;
using namespace crypto;

static Persistent<FunctionTemplate> NodeInfoTpl;
static Persistent<FunctionTemplate> SocketAddressTpl;
static Persistent<FunctionTemplate> NetConfigTpl;
static Persistent<FunctionTemplate> UDPAdapterTpl;
static Persistent<FunctionTemplate> HttpServerTpl;
static Persistent<FunctionTemplate> HttpServerRequestTpl;

void nodeInfoGetPublicKey(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(vectorToV8(ac.isolate, nodeInfo->getPublicKey().pack()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetNodeAddress(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            SocketAddress* saPtr = const_cast<SocketAddress*>(&(nodeInfo->getNodeAddress()));
            Local<Value> res[1] {wrap(SocketAddressTpl, ac.isolate, saPtr)};
            ac.setReturnValue(res[0]);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetClientAddress(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            SocketAddress* saPtr = const_cast<SocketAddress*>(&(nodeInfo->getClientAddress()));
            Local<Value> res[1] {wrap(SocketAddressTpl, ac.isolate, saPtr)};
            ac.setReturnValue(res[0]);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetServerAddress(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            SocketAddress* saPtr = const_cast<SocketAddress*>(&(nodeInfo->getServerAddress()));
            Local<Value> res[1] {wrap(SocketAddressTpl, ac.isolate, saPtr)};
            ac.setReturnValue(res[0]);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetNumber(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(nodeInfo->getNumber());
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetName(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(ac.v8String(nodeInfo->getName()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetPublicHost(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(ac.v8String(nodeInfo->getPublicHost()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initNodeInfo(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<NodeInfo>(
            isolate,
            "NodeInfoImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> NodeInfo* {
                if (args.Length() == 8) {
                    if (!args[0]->IsTypedArray()) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor argument #0")));
                        return nullptr;
                    }
                    auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                    crypto::PublicKey publicKey(contents.Data(), contents.ByteLength());

                    return new NodeInfo(
                        publicKey,
                        args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),     // number
                        string(*String::Utf8Value(isolate, args[2])),                     // nodeName
                        string(*String::Utf8Value(isolate, args[3])),                     // host
                        string(*String::Utf8Value(isolate, args[4])),                     // publicHost
                        args[5]->Int32Value(isolate->GetCurrentContext()).FromJust(),     // datagramPort
                        args[6]->Int32Value(isolate->GetCurrentContext()).FromJust(),     // clientHttpPort
                        args[7]->Int32Value(isolate->GetCurrentContext()).FromJust()      // serverHttpPort
                    );
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__getPublicKey", FunctionTemplate::New(isolate, nodeInfoGetPublicKey));
    prototype->Set(isolate, "__getNodeAddress", FunctionTemplate::New(isolate, nodeInfoGetNodeAddress));
    prototype->Set(isolate, "__getClientAddress", FunctionTemplate::New(isolate, nodeInfoGetClientAddress));
    prototype->Set(isolate, "__getServerAddress", FunctionTemplate::New(isolate, nodeInfoGetServerAddress));
    prototype->Set(isolate, "__getNumber", FunctionTemplate::New(isolate, nodeInfoGetNumber));
    prototype->Set(isolate, "__getName", FunctionTemplate::New(isolate, nodeInfoGetName));
    prototype->Set(isolate, "__getPublicHost", FunctionTemplate::New(isolate, nodeInfoGetPublicHost));

    NodeInfoTpl.Reset(isolate, tpl);
    return tpl;
}

void socketAddressGetHost(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto socketAddress = unwrap<SocketAddress>(ac.args.This());
            ac.setReturnValue(ac.v8String(socketAddress->host));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void socketAddressGetPort(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto socketAddress = unwrap<SocketAddress>(ac.args.This());
            ac.setReturnValue(socketAddress->port);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initSocketAddress(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<SocketAddress>(
            isolate,
            "SocketAddressImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> SocketAddress* {
                if (args.Length() == 2) {
                    return new SocketAddress(
                            string(*String::Utf8Value(isolate, args[0])),                    // host
                            args[1]->Int32Value(isolate->GetCurrentContext()).FromJust()     // port
                    );
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__getHost", FunctionTemplate::New(isolate, socketAddressGetHost));
    prototype->Set(isolate, "__getPort", FunctionTemplate::New(isolate, socketAddressGetPort));

    SocketAddressTpl.Reset(isolate, tpl);
    return tpl;
}

void netConfig_addNode(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto netConfig = unwrap<NetConfig>(ac.args.This());
            auto nodeInfo = unwrap<NodeInfo>(Local<Object>::Cast(ac.args[0]));
            try {
                netConfig->addNode(*nodeInfo);
            } catch (const std::exception& e) {
                ac.throwError(e.what());
            }
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void netConfig_getInfo(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto netConfig = unwrap<NetConfig>(ac.args.This());
            auto nodeId = ac.asInt(0);
            try {
                const NodeInfo* pni = &netConfig->getInfo(nodeId);
                Local<Value> res[1] {wrap(NodeInfoTpl, ac.isolate, const_cast<NodeInfo*>(pni))};
                ac.setReturnValue(res[0]);
            } catch (const std::exception& e) {
                ac.throwError(e.what());
            }
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void netConfig_find(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto netConfig = unwrap<NetConfig>(ac.args.This());
            auto nodeId = ac.asInt(0);
            try {
                ac.setReturnValue(netConfig->find(nodeId));
            } catch (const std::exception& e) {
                ac.throwError(e.what());
            }
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void netConfig_toList(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto netConfig = unwrap<NetConfig>(ac.args.This());
            vector<NodeInfo*> list = netConfig->toList();
            Local<Array> arr = Array::New(ac.isolate, list.size());
            for (int i = 0; i < list.size(); ++i)
                arr->Set(i, wrap(NodeInfoTpl, ac.isolate, list[i]));
            ac.setReturnValue(arr);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initNetConfig(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<NetConfig>(isolate, "NetConfigImpl");

    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__addNode", FunctionTemplate::New(isolate, netConfig_addNode));
    prototype->Set(isolate, "__getInfo", FunctionTemplate::New(isolate, netConfig_getInfo));
    prototype->Set(isolate, "__find", FunctionTemplate::New(isolate, netConfig_find));
    prototype->Set(isolate, "__toList", FunctionTemplate::New(isolate, netConfig_toList));

    NetConfigTpl.Reset(isolate, tpl);
    return tpl;
}

class UDPAdapterWrapper {
public:
    UDPAdapterWrapper() {
        timer_.scheduleAtFixedRate([this](){
            sendAllFromBuf();
        }, 20, 20);
    }
    virtual ~UDPAdapterWrapper() {
        close();
    }
    void create(const crypto::PrivateKey& ownPrivateKey, int ownNodeNumber, const NetConfig& netConfig) {
        udpAdapterPtr_ = new UDPAdapter(ownPrivateKey, ownNodeNumber, netConfig, [](const byte_vector &packet, const NodeInfo &fromNode){});
    }
    void close() {
        timer_.stop();
        se_ = nullptr;
        delete udpAdapterPtr_;
        udpAdapterPtr_ = nullptr;
    }
    void send(int destNodeNumber, const byte_vector& payload) {
        udpAdapterPtr_->send(destNodeNumber, payload);
    }
    void setReceiveCallback(Persistent<Function>* pcb, shared_ptr<Scripter> se) {
        if (pcb_ != nullptr) {
            pcb_->Reset();
            delete pcb_;
        }
        pcb_ = pcb;
        se_ = se;
        udpAdapterPtr_->setReceiveCallback([=](const byte_vector &packet, const NodeInfo &fromNode) {
            atomic<bool> needSend(false);
            {
                lock_guard lock(mutex_);
                buf_.emplace_back(make_pair(packet, fromNode.getNumber()));
                if (buf_.size() >= 100)
                    needSend = true;
            }
            if (needSend) {
                sendAllFromBuf();
            }
        });
    }
private:
    void sendAllFromBuf() {
        lock_guard lock(mutex_);
        if ((se_ != nullptr) && (buf_.size() > 0)) {
            auto bufCopy = buf_;
            buf_.clear();
            se_->inPool([=](Local<Context> &context) {
                auto fn = pcb_->Get(context->GetIsolate());
                if (fn->IsNull()) {
                    se_->throwError("null callback in setReceiveCallback");
                } else {
                    Local<Array> arr = Array::New(se_->isolate(), bufCopy.size() * 2);
                    for (int i = 0; i < bufCopy.size(); ++i) {
                        auto &p = bufCopy[i].first;
                        auto ab = ArrayBuffer::New(se_->isolate(), p.size());
                        memcpy(ab->GetContents().Data(), &p[0], p.size());
                        arr->Set(i * 2, Uint8Array::New(ab, 0, p.size()));
                        arr->Set(i * 2 + 1, Integer::New(se_->isolate(), bufCopy[i].second));
                    }
                    Local<Value> result = arr;
                    fn->Call(fn, 1, &result);
                }
            });
        }
    }
private:
    UDPAdapter* udpAdapterPtr_ = nullptr;
    Persistent<Function>* pcb_ = nullptr;
    shared_ptr<Scripter> se_ = nullptr;
    vector<pair<byte_vector,int>> buf_;
    TimerThread timer_;
    std::mutex mutex_;
};

void udpAdapter_send(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto udpAdapter = unwrap<UDPAdapterWrapper>(ac.args.This());
            int destNodeNumber = ac.asInt(0);
            auto contents = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv(contents.ByteLength());
            memcpy(&bv[0], contents.Data(), contents.ByteLength());
            udpAdapter->send(destNodeNumber, bv);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void udpAdapter_setReceiveCallback(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 1) {
            auto udpAdapter = unwrap<UDPAdapterWrapper>(args.This());
            Persistent<Function> *pcb = new Persistent<Function>(isolate, args[0].As<Function>());
            udpAdapter->setReceiveCallback(pcb, se);
            return;
        }
        se->throwError("invalid arguments");
    });
}

void udpAdapter_close(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 0) {
            auto udpAdapter = unwrap<UDPAdapterWrapper>(args.This());
            udpAdapter->close();
            return;
        }
        se->throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initUDPAdapter(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<UDPAdapterWrapper>(
            isolate,
            "UDPAdapterImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> UDPAdapterWrapper* {
                if (args.Length() == 3) {
                    try {
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        crypto::PrivateKey privateKey(contents.Data(), contents.ByteLength());
                        auto res = new UDPAdapterWrapper();
                        res->create(
                            privateKey,                                                      // ownPrivateKey
                            args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),    // ownNodeNumber
                            *unwrap<NetConfig>(Local<Object>::Cast(args[2]))                 // netConfig
                        );
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what())));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__send", FunctionTemplate::New(isolate, udpAdapter_send));
    prototype->Set(isolate, "__setReceiveCallback", FunctionTemplate::New(isolate, udpAdapter_setReceiveCallback));
    prototype->Set(isolate, "__close", FunctionTemplate::New(isolate, udpAdapter_close));

    UDPAdapterTpl.Reset(isolate, tpl);
    return tpl;
}

void httpServer_startServer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServer = unwrap<HttpServer>(ac.args.This());
            httpServer->start();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpServer_stopServer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServer = unwrap<HttpServer>(ac.args.This());
            httpServer->stop();
            httpServer->join();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpServer_addEndpoint(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpServer = unwrap<HttpServer>(ac.args.This());
            std::shared_ptr<v8::Persistent<v8::Function>> jsCallback (
                    new v8::Persistent<v8::Function>(ac.isolate, ac.args[1].As<v8::Function>()), [](auto p){
                        p->Reset();
                        delete p;
                    }
            );
            auto se = ac.scripter;
            httpServer->addEndpoint(ac.asString(0), [jsCallback,se](HttpServerRequest& request){
                HttpServerRequest* hsrp = &request;
                se->inPool([=](Local<Context> &context) {
                    auto fn = jsCallback->Get(context->GetIsolate());
                    Local<Value> res[1] {wrap(HttpServerRequestTpl, se->isolate(), hsrp)};
                    fn->Call(fn, 1, res);
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initHttpServer(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<HttpServer>(
            isolate,
            "HttpServerTpl",
            [=](const FunctionCallbackInfo<Value> &args) -> HttpServer* {
                if (args.Length() == 3) {
                    try {
                        auto res = new HttpServer(
                            string(*String::Utf8Value(isolate, args[0])),                          // host
                            args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),          // port
                            args[2]->Int32Value(isolate->GetCurrentContext()).FromJust()           // poolSize
                        );
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what())));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__startServer", FunctionTemplate::New(isolate, httpServer_startServer));
    prototype->Set(isolate, "__stopServer", FunctionTemplate::New(isolate, httpServer_stopServer));
    prototype->Set(isolate, "__addEndpoint", FunctionTemplate::New(isolate, httpServer_addEndpoint));

    HttpServerTpl.Reset(isolate, tpl);
    return tpl;
}

void JsInitNetwork(Isolate *isolate, const Local<ObjectTemplate> &global) {

    JsInitHttpServerRequest(isolate, global);

    auto network = ObjectTemplate::New(isolate);

    network->Set(isolate, "NodeInfoImpl", initNodeInfo(isolate));
    network->Set(isolate, "SocketAddressImpl", initSocketAddress(isolate));
    network->Set(isolate, "NetConfigImpl", initNetConfig(isolate));
    network->Set(isolate, "UDPAdapterImpl", initUDPAdapter(isolate));
    network->Set(isolate, "HttpServerImpl", initHttpServer(isolate));

    global->Set(isolate, "network", network);
}

void HttpServerRequest_setStatusCode(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequest = unwrap<HttpServerRequest>(ac.args.This());
            httpServerRequest->setStatusCode(ac.asInt(0));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequest_setHeader(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpServerRequest = unwrap<HttpServerRequest>(ac.args.This());
            httpServerRequest->setHeader(ac.asString(0), ac.asString(1));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequest_setAnswerBody(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequest = unwrap<HttpServerRequest>(ac.args.This());
            auto contents = ac.args[0].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv(contents.ByteLength());
            memcpy(&bv[0], contents.Data(), contents.ByteLength());
            httpServerRequest->setAnswerBody(std::move(bv));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequest_sendAnswer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServerRequest = unwrap<HttpServerRequest>(ac.args.This());
            httpServerRequest->sendAnswerFromAnotherThread();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitHttpServerRequest(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<network::HttpServerRequest>(isolate, "HttpServerRequest");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "setStatusCode", FunctionTemplate::New(isolate, HttpServerRequest_setStatusCode));
    prototype->Set(isolate, "setHeader", FunctionTemplate::New(isolate, HttpServerRequest_setHeader));
    prototype->Set(isolate, "setAnswerBody", FunctionTemplate::New(isolate, HttpServerRequest_setAnswerBody));
    prototype->Set(isolate, "sendAnswer", FunctionTemplate::New(isolate, HttpServerRequest_sendAnswer));

    // register it into global namespace
    HttpServerRequestTpl.Reset(isolate, tpl);
    global->Set(isolate, "HttpServerRequest", tpl);
}
