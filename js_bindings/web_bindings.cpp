//
// Created by Leonid Novikov on 4/8/19.
//

#include "web_bindings.h"
#include "binding_tools.h"
#include "../network/HttpServer.h"
#include "../network/HttpClient.h"
#include "../network/UDPAdapter.h"

using namespace network;
using namespace crypto;

static Persistent<FunctionTemplate> NodeInfoTpl;
static Persistent<FunctionTemplate> SocketAddressTpl;
static Persistent<FunctionTemplate> NetConfigTpl;
static Persistent<FunctionTemplate> UDPAdapterTpl;
static Persistent<FunctionTemplate> HttpServerTpl;
static Persistent<FunctionTemplate> HttpServerRequestBufTpl;
static Persistent<FunctionTemplate> HttpServerRequestSecureBufTpl;
static Persistent<FunctionTemplate> HttpClientTpl;

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

void nodeInfoGetHost(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(ac.v8String(nodeInfo->getHost()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetHostV6(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(ac.v8String(nodeInfo->getHostV6()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void nodeInfoGetPublicPort(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(nodeInfo->getPublicPort());
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
                if (args.Length() == 9) {
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
                        string(*String::Utf8Value(isolate, args[4])),                     // hostV6
                        string(*String::Utf8Value(isolate, args[5])),                     // publicHost
                        args[6]->Int32Value(isolate->GetCurrentContext()).FromJust(),     // datagramPort
                        args[7]->Int32Value(isolate->GetCurrentContext()).FromJust(),     // clientHttpPort
                        args[8]->Int32Value(isolate->GetCurrentContext()).FromJust()      // publicHttpPort
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
    prototype->Set(isolate, "__getNumber", FunctionTemplate::New(isolate, nodeInfoGetNumber));
    prototype->Set(isolate, "__getName", FunctionTemplate::New(isolate, nodeInfoGetName));
    prototype->Set(isolate, "__getPublicHost", FunctionTemplate::New(isolate, nodeInfoGetPublicHost));
    prototype->Set(isolate, "__getHost", FunctionTemplate::New(isolate, nodeInfoGetHost));
    prototype->Set(isolate, "__getHostV6", FunctionTemplate::New(isolate, nodeInfoGetHostV6));
    prototype->Set(isolate, "__getPublicPort", FunctionTemplate::New(isolate, nodeInfoGetPublicPort));

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

void netConfig_getSize(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto netConfig = unwrap<NetConfig>(ac.args.This());
            unsigned int size = netConfig->getSize();
            ac.setReturnValue(size);
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
    prototype->Set(isolate, "__getSize", FunctionTemplate::New(isolate, netConfig_getSize));

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
                if (se_ == nullptr)
                    return;
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
                    auto unused = fn->Call(context, fn, 1, &result);
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

class HttpServerRequestBuf {
public:
    void setStatusCode(int idx, int statusCode) {
        buf_.at(idx)->setStatusCode(statusCode);
    }
    void setHeader(int idx, const std::string& key, const std::string& value) {
        buf_.at(idx)->setHeader(key, value);
    }
    void setAnswerBody(int idx, const byte_vector& body) {
        buf_.at(idx)->setAnswerBody(body);
    }
    void sendAnswer(int idx) {
        buf_.at(idx)->sendAnswerFromAnotherThread();
        ++sendAnswerCounter;
        if (sendAnswerCounter >= buf_.size())
            delete this;
    }
    std::string getEndpoint(int idx) {
        return buf_.at(idx)->getEndpoint();
    }
    std::string getPath(int idx) {
        return buf_.at(idx)->getPath();
    }
    int getBufLength() {
        return (int)buf_.size();
    }
    std::string getQueryString(int idx) {
        return buf_.at(idx)->getQueryString();
    }
    std::string getMethod(int idx) {
        return buf_.at(idx)->getMethod();
    }
    byte_vector getRequestBody(int idx) {
        return buf_.at(idx)->getRequestBody();
    }
public:
    void addHttpServerRequest(HttpServerRequest* req) {
        buf_.emplace_back(req);
    }
private:
    std::vector<HttpServerRequest*> buf_;
    size_t sendAnswerCounter = 0;
};

struct SecureEndpointParams {
    byte_vector paramsBin;
    shared_ptr<HttpServerSession> session;
    function<void(const byte_vector& ansBin)> ansCallback;
};

class HttpServerSecureRequestBuf {
public:
    void setAnswersReadyCallback(std::function<void()>&& onAnswersReady) {
        onAnswersReady_ = std::move(onAnswersReady);
    }
    void sendAnswer(int idx) {
        //buf_.at(idx)->sendAnswerFromAnotherThread();
    }
    int getBufLength() {
        return (int)buf_.size();
    }
    byte_vector getParamsBin(int idx) {
        return buf_[idx].first;
    }
    byte_vector getPublicKeyBin(int idx) {
        return buf_[idx].second->publicKey.pack();
    }
    void setAnswer(int idx, byte_vector&& ans) {
        answers_[idx] = std::move(ans);
        ++answersCount_;
        if (answersCount_ >= buf_.size())
            onAnswersReady_();
    }
public:
    void addHttpServerSecureRequest(const byte_vector& paramsBin, shared_ptr<HttpServerSession> session) {
        buf_.emplace_back(make_pair(paramsBin, session));
    }
    void resizeAnswersBuf() {
        answers_.resize(buf_.size());
    }
    byte_vector getAnswer(int idx) {
        return answers_[idx];
    }
private:
    std::vector<pair<byte_vector,shared_ptr<HttpServerSession>>> buf_;
    std::vector<byte_vector> answers_;
    size_t answersCount_ = 0;
    std::function<void()> onAnswersReady_;
};

class HttpServerBuffered {
public:

    void initSecureEndpoint() {
        srv_->addSecureCallback([this](const byte_vector& paramsBin, std::shared_ptr<HttpServerSession> session, std::function<void(const byte_vector& ansBin)>&& sendAnswer){
            atomic<bool> needSend(false);
            {
                lock_guard lock(mutex_);
                SecureEndpointParams sep;
                sep.paramsBin = paramsBin;
                sep.ansCallback = std::move(sendAnswer);
                sep.session = session;
                bufSecure_.emplace_back(sep);
                if (bufSecure_.size() >= bufSize_)
                    needSend = true;
            }
            if (needSend) {
                sendAllFromSecureBuf();
            }
        });
    }

    HttpServerBuffered(std::string host, int port, int poolSize, int bufSize)
     : bufSize_(bufSize) {
        srv_ = new HttpServer(host, port, poolSize);
        timer_.scheduleAtFixedRate([this](){
            sendAllFromBuf();
            sendAllFromSecureBuf();
        }, 20, 20);
        initSecureEndpoint();
    }

    ~HttpServerBuffered() {
        stop();
    }

    void addEndpoint(const std::string &endpoint) {
        srv_->addEndpoint(endpoint, [this](HttpServerRequest *req) {
            atomic<bool> needSend(false);
            {
                lock_guard lock(mutex_);
                buf_.emplace_back(req);
                if (buf_.size() >= bufSize_)
                    needSend = true;
            }
            if (needSend) {
                sendAllFromBuf();
            }
        });
    }

    void setBufferedCallback(Persistent<Function>* pcb, shared_ptr<Scripter> se) {
        if (pcb_ != nullptr) {
            pcb_->Reset();
            delete pcb_;
        }
        pcb_ = pcb;
        se_ = se;
    }

    void setBufferedSecureCallback(Persistent<Function>* pcb, shared_ptr<Scripter> se) {
        if (pcbSecure_ != nullptr) {
            pcbSecure_->Reset();
            delete pcbSecure_;
        }
        pcbSecure_ = pcb;
        seSecure_ = se;
    }

    void initSecureProtocol(byte_vector nodePrivateKeyPacked) {
        crypto::PrivateKey nodePrivateKey(nodePrivateKeyPacked);
        srv_->initSecureProtocol(nodePrivateKey);
    }

    void start() {
        srv_->start();
    }

    void stop() {
        if (srv_ != nullptr) {
            timer_.stop();
            srv_->stop();
            srv_->join();
        }
        delete srv_;
        srv_ = nullptr;
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
                    se_->throwError("null callback in sendAllFromBuf");
                } else {
                    HttpServerRequestBuf* buf = new HttpServerRequestBuf();
                    for (int i = 0; i < bufCopy.size(); ++i)
                        buf->addHttpServerRequest(bufCopy[i]);
                    Local<Value> res[1] = {wrap(HttpServerRequestBufTpl, se_->isolate(), buf)};
                    auto unused = fn->Call(context, fn, 1, res);
                    // delete buf from HttpServerRequestBuf::sendAnswer
                }
            });
        }
    }
    void sendAllFromSecureBuf() {
        lock_guard lock(mutex_);
        if ((seSecure_ != nullptr) && (bufSecure_.size() > 0)) {
            auto bufCopy = bufSecure_;
            bufSecure_.clear();
            seSecure_->inPool([=](Local<Context> &context) {
                auto fn = pcbSecure_->Get(context->GetIsolate());
                if (fn->IsNull()) {
                    seSecure_->throwError("null callback in sendAllFromSecureBuf");
                } else {
                    HttpServerSecureRequestBuf* buf = new HttpServerSecureRequestBuf();
                    for (int i = 0; i < bufCopy.size(); ++i)
                        buf->addHttpServerSecureRequest(bufCopy[i].paramsBin, bufCopy[i].session);
                    buf->resizeAnswersBuf();
                    buf->setAnswersReadyCallback([bufCopy,buf](){
                        for (int i = 0; i < bufCopy.size(); ++i)
                            bufCopy[i].ansCallback(buf->getAnswer(i));
                        delete buf;
                    });
                    Local<Value> res[1] = {wrap(HttpServerRequestSecureBufTpl, seSecure_->isolate(), buf)};
                    auto unused = fn->Call(context, fn, 1, res);
                }
            });
        }
    }

private:
    HttpServer* srv_;
    std::vector<HttpServerRequest*> buf_;
    std::vector<SecureEndpointParams> bufSecure_;
    std::mutex mutex_;
    Persistent<Function>* pcb_ = nullptr;
    shared_ptr<Scripter> se_ = nullptr;
    Persistent<Function>* pcbSecure_ = nullptr;
    shared_ptr<Scripter> seSecure_ = nullptr;
    TimerThread timer_;
    const int bufSize_;
};

void httpServer_setBufferedCallback(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 1) {
            auto httpServer = unwrap<HttpServerBuffered>(args.This());
            Persistent<Function> *pcb = new Persistent<Function>(isolate, args[0].As<Function>());
            httpServer->setBufferedCallback(pcb, se);
            return;
        }
        se->throwError("invalid arguments");
    });
}

void httpServer_setBufferedSecureCallback(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 1) {
            auto httpServer = unwrap<HttpServerBuffered>(args.This());
            Persistent<Function> *pcb = new Persistent<Function>(isolate, args[0].As<Function>());
            httpServer->setBufferedSecureCallback(pcb, se);
            return;
        }
        se->throwError("invalid arguments");
    });
}

void httpServer_startServer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServer = unwrap<HttpServerBuffered>(ac.args.This());
            httpServer->start();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpServer_stopServer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServer = unwrap<HttpServerBuffered>(ac.args.This());
            httpServer->stop();
            //delete httpServer; - don't delete it here. It should be deleted automatically from js GC call.
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpServer_addEndpoint(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServer = unwrap<HttpServerBuffered>(ac.args.This());
            httpServer->addEndpoint(ac.asString(0));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpServer_initSecureProtocol(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServer = unwrap<HttpServerBuffered>(ac.args.This());
            auto contents = ac.args[0].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv(contents.ByteLength());
            memcpy(&bv[0], contents.Data(), contents.ByteLength());
            httpServer->initSecureProtocol(bv);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initHttpServer(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<HttpServerBuffered>(
            isolate,
            "HttpServerTpl",
            [=](const FunctionCallbackInfo<Value> &args) -> HttpServerBuffered* {
                if (args.Length() == 4) {
                    try {
                        auto res = new HttpServerBuffered(
                            string(*String::Utf8Value(isolate, args[0])),                          // host
                            args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),          // port
                            args[2]->Int32Value(isolate->GetCurrentContext()).FromJust(),          // poolSize
                            args[3]->Int32Value(isolate->GetCurrentContext()).FromJust()           // bufSize
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
    prototype->Set(isolate, "__setBufferedCallback", FunctionTemplate::New(isolate, httpServer_setBufferedCallback));
    prototype->Set(isolate, "__setBufferedSecureCallback", FunctionTemplate::New(isolate, httpServer_setBufferedSecureCallback));
    prototype->Set(isolate, "__startServer", FunctionTemplate::New(isolate, httpServer_startServer));
    prototype->Set(isolate, "__stopServer", FunctionTemplate::New(isolate, httpServer_stopServer));
    prototype->Set(isolate, "__addEndpoint", FunctionTemplate::New(isolate, httpServer_addEndpoint));
    prototype->Set(isolate, "__initSecureProtocol", FunctionTemplate::New(isolate, httpServer_initSecureProtocol));

    HttpServerTpl.Reset(isolate, tpl);
    return tpl;
}

struct HttpClientAnswer {
    int reqId;
    int respStatus;
    byte_vector body;
};

struct HttpClientCommandAnswer {
    int reqId;
    byte_vector decrypted;
};

class HttpClientBuffered {
public:
    HttpClientBuffered(const std::string& rootUrl, int poolSize, int bufSize): httpClient_(rootUrl, poolSize), bufSize_(bufSize), startPool_(1) {
        timer_.scheduleAtFixedRate([this](){
            sendAllFromBuf();
            sendAllFromBufCommand();
        }, 20, 20);
    }

    void sendGetRequest(int reqId, const std::string& url) {
        httpClient_.sendGetRequest(url, [this,reqId](int respStatus, byte_vector&& body) {
            atomic<bool> needSend(false);
            {
                lock_guard lock(mutex_);
                HttpClientAnswer ans;
                ans.reqId = reqId;
                ans.respStatus = respStatus;
                ans.body = std::move(body);
                buf_.emplace_back(ans);
                if (buf_.size() >= bufSize_)
                    needSend = true;
            }
            if (needSend) {
                sendAllFromBuf();
            }
        });
    }

    void command(int reqId, const byte_vector& callBin) {
        httpClient_.command(callBin, [this,reqId](byte_vector&& decrypted){
            atomic<bool> needSend(false);
            {
                lock_guard lock(mutex_);
                HttpClientCommandAnswer ans;
                ans.reqId = reqId;
                ans.decrypted = std::move(decrypted);
                bufCommand_.emplace_back(ans);
                if (bufCommand_.size() >= bufSize_)
                    needSend = true;
            }
            if (needSend) {
                sendAllFromBufCommand();
            }
        });
    }

    void setBufferedCallback(Persistent<Function>* pcb, shared_ptr<Scripter> se) {
        if (pcb_ != nullptr) {
            pcb_->Reset();
            delete pcb_;
        }
        pcb_ = pcb;
        se_ = se;
    }

    void setBufferedCommandCallback(Persistent<Function>* pcb, shared_ptr<Scripter> se) {
        if (pcbCommand_ != nullptr) {
            pcbCommand_->Reset();
            delete pcbCommand_;
        }
        pcbCommand_ = pcb;
        seCommand_ = se;
    }

    void start(const byte_vector& clientPrivateKeyPacked, const byte_vector& nodePublicKeyPacked, const std::function<void()>& onComplete) {
        startPool_.execute([this,clientPrivateKeyPacked,nodePublicKeyPacked,onComplete](){
            httpClient_.start(crypto::PrivateKey(clientPrivateKeyPacked), crypto::PublicKey(nodePublicKeyPacked));
            onComplete();
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
                    se_->throwError("null callback in setBufferedCallback");
                } else {
                    Local<Array> arr = Array::New(se_->isolate(), bufCopy.size()*3);
                    for (int i = 0; i < bufCopy.size(); ++i) {
                        auto ab = ArrayBuffer::New(se_->isolate(), bufCopy[i].body.size());
                        memcpy(ab->GetContents().Data(), &bufCopy[i].body[0], bufCopy[i].body.size());
                        arr->Set(i * 3 + 0, Integer::New(se_->isolate(), bufCopy[i].reqId));
                        arr->Set(i * 3 + 1, Integer::New(se_->isolate(), bufCopy[i].respStatus));
                        arr->Set(i * 3 + 2, Uint8Array::New(ab, 0, bufCopy[i].body.size()));
                    }
                    Local<Value> result = arr;
                    auto unused = fn->Call(context, fn, 1, &result);
                }
            });
        }
    }

    void sendAllFromBufCommand() {
        lock_guard lock(mutex_);
        if ((seCommand_ != nullptr) && (bufCommand_.size() > 0)) {
            auto bufCopy = bufCommand_;
            bufCommand_.clear();
            seCommand_->inPool([=](Local<Context> &context) {
                auto fn = pcbCommand_->Get(context->GetIsolate());
                if (fn->IsNull()) {
                    seCommand_->throwError("null callback in setBufferedCommandCallback");
                } else {
                    Local<Array> arr = Array::New(seCommand_->isolate(), bufCopy.size()*2);
                    for (int i = 0; i < bufCopy.size(); ++i) {
                        auto ab = ArrayBuffer::New(seCommand_->isolate(), bufCopy[i].decrypted.size());
                        memcpy(ab->GetContents().Data(), &bufCopy[i].decrypted[0], bufCopy[i].decrypted.size());
                        arr->Set(i * 2 + 0, Integer::New(se_->isolate(), bufCopy[i].reqId));
                        arr->Set(i * 2 + 1, Uint8Array::New(ab, 0, bufCopy[i].decrypted.size()));
                    }
                    Local<Value> result = arr;
                    auto unused = fn->Call(context, fn, 1, &result);
                }
            });
        }
    }

private:
    HttpClient httpClient_;
    Persistent<Function>* pcb_ = nullptr;
    shared_ptr<Scripter> se_ = nullptr;
    std::vector<HttpClientAnswer> buf_;
    std::mutex mutex_;
    const int bufSize_ = 1;
    TimerThread timer_;
    ThreadPool startPool_;
    std::vector<HttpClientCommandAnswer> bufCommand_;
    Persistent<Function>* pcbCommand_ = nullptr;
    shared_ptr<Scripter> seCommand_ = nullptr;
};

void httpClient_sendGetRequest(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpClient = unwrap<HttpClientBuffered>(ac.args.This());
            httpClient->sendGetRequest(ac.asInt(0), ac.asString(1));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpClient_command(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpClient = unwrap<HttpClientBuffered>(ac.args.This());
            auto contents0 = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
            byte_vector callBin(contents0.ByteLength());
            memcpy(&callBin[0], contents0.Data(), contents0.ByteLength());
            httpClient->command(ac.asInt(0), callBin);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void httpClient_setBufferedCallback(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 1) {
            auto httpServer = unwrap<HttpClientBuffered>(args.This());
            Persistent<Function> *pcb = new Persistent<Function>(isolate, args[0].As<Function>());
            httpServer->setBufferedCallback(pcb, se);
            return;
        }
        se->throwError("invalid arguments");
    });
}

void httpClient_setBufferedCommandCallback(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 1) {
            auto httpServer = unwrap<HttpClientBuffered>(args.This());
            Persistent<Function> *pcb = new Persistent<Function>(isolate, args[0].As<Function>());
            httpServer->setBufferedCommandCallback(pcb, se);
            return;
        }
        se->throwError("invalid arguments");
    });
}

void httpClient_start(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrap(args, [&](const shared_ptr<Scripter> se, auto isolate, auto context) {
        if (args.Length() == 3) {
            auto httpClient = unwrap<HttpClientBuffered>(args.This());

            auto contents0 = args[0].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv0(contents0.ByteLength());
            memcpy(&bv0[0], contents0.Data(), contents0.ByteLength());

            auto contents1 = args[1].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv1(contents1.ByteLength());
            memcpy(&bv1[0], contents1.Data(), contents1.ByteLength());

            auto fn = args[2].As<Function>();
            if (fn->IsNull() || fn->IsUndefined()) {
                se->throwError("null callback in HttpClient.start");
                return;
            }
            Persistent<Function> *pcb = new Persistent<Function>(se->isolate(), fn);

            httpClient->start(bv0, bv1, [=](){
                se->inPool([=](auto context) {
                    Isolate *isolate = context->GetIsolate();
                    auto fn = pcb->Get(isolate);
                    auto unused = fn->Call(context, fn, 0, nullptr);
                    pcb->Reset();
                    delete pcb;
                });
            });

            return;
        }
        se->throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initHttpClient(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<HttpClientBuffered>(
            isolate,
            "HttpClientTpl",
            [=](const FunctionCallbackInfo<Value> &args) -> HttpClientBuffered* {
                if (args.Length() == 3) {
                    try {
                        auto res = new HttpClientBuffered(
                            string(*String::Utf8Value(isolate, args[0])),                          // rootUrl
                            args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),          // poolSize
                            args[2]->Int32Value(isolate->GetCurrentContext()).FromJust()           // bufSize
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
    prototype->Set(isolate, "__sendGetRequest", FunctionTemplate::New(isolate, httpClient_sendGetRequest));
    prototype->Set(isolate, "__command", FunctionTemplate::New(isolate, httpClient_command));
    prototype->Set(isolate, "__setBufferedCallback", FunctionTemplate::New(isolate, httpClient_setBufferedCallback));
    prototype->Set(isolate, "__setBufferedCommandCallback", FunctionTemplate::New(isolate, httpClient_setBufferedCommandCallback));
    prototype->Set(isolate, "__start", FunctionTemplate::New(isolate, httpClient_start));

    HttpClientTpl.Reset(isolate, tpl);
    return tpl;
}

void JsInitNetwork(Isolate *isolate, const Local<ObjectTemplate> &global) {

    JsInitHttpServerRequest(isolate, global);
    JsInitHttpServerSecureRequest(isolate, global);

    auto network = ObjectTemplate::New(isolate);

    network->Set(isolate, "NodeInfoImpl", initNodeInfo(isolate));
    network->Set(isolate, "SocketAddressImpl", initSocketAddress(isolate));
    network->Set(isolate, "NetConfigImpl", initNetConfig(isolate));
    network->Set(isolate, "UDPAdapterImpl", initUDPAdapter(isolate));
    network->Set(isolate, "HttpServerImpl", initHttpServer(isolate));
    network->Set(isolate, "HttpClientImpl", initHttpClient(isolate));

    global->Set(isolate, "network", network);
}

void HttpServerRequestBuf_setStatusCode(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            httpServerRequestBuf->setStatusCode(ac.asInt(0), ac.asInt(1));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_setHeader(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            httpServerRequestBuf->setHeader(ac.asInt(0), ac.asString(1), ac.asString(2));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_setAnswerBody(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            auto contents = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv(contents.ByteLength());
            memcpy(&bv[0], contents.Data(), contents.ByteLength());
            httpServerRequestBuf->setAnswerBody(ac.asInt(0), std::move(bv));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_sendAnswer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            httpServerRequestBuf->sendAnswer(ac.asInt(0));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getEndpoint(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.v8String(httpServerRequestBuf->getEndpoint(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getPath(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.v8String(httpServerRequestBuf->getPath(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getBufLength(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(httpServerRequestBuf->getBufLength());
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getQueryString(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.v8String(httpServerRequestBuf->getQueryString(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getMethod(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.v8String(httpServerRequestBuf->getMethod(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerRequestBuf_getRequestBody(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerRequestBuf = unwrap<HttpServerRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.toBinary(httpServerRequestBuf->getRequestBody(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitHttpServerRequest(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<HttpServerRequestBuf>(isolate, "HttpServerRequestBuf");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "setStatusCode", FunctionTemplate::New(isolate, HttpServerRequestBuf_setStatusCode));
    prototype->Set(isolate, "setHeader", FunctionTemplate::New(isolate, HttpServerRequestBuf_setHeader));
    prototype->Set(isolate, "setAnswerBody", FunctionTemplate::New(isolate, HttpServerRequestBuf_setAnswerBody));
    prototype->Set(isolate, "sendAnswer", FunctionTemplate::New(isolate, HttpServerRequestBuf_sendAnswer));
    prototype->Set(isolate, "getEndpoint", FunctionTemplate::New(isolate, HttpServerRequestBuf_getEndpoint));
    prototype->Set(isolate, "getPath", FunctionTemplate::New(isolate, HttpServerRequestBuf_getPath));
    prototype->Set(isolate, "getBufLength", FunctionTemplate::New(isolate, HttpServerRequestBuf_getBufLength));
    prototype->Set(isolate, "getQueryString", FunctionTemplate::New(isolate, HttpServerRequestBuf_getQueryString));
    prototype->Set(isolate, "getMethod", FunctionTemplate::New(isolate, HttpServerRequestBuf_getMethod));
    prototype->Set(isolate, "getRequestBody", FunctionTemplate::New(isolate, HttpServerRequestBuf_getRequestBody));

    // register it into global namespace
    HttpServerRequestBufTpl.Reset(isolate, tpl);
    global->Set(isolate, "HttpServerRequestBuf", tpl);
}

void HttpServerSecureRequestBuf_getBufLength(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto httpServerSecureRequestBuf = unwrap<HttpServerSecureRequestBuf>(ac.args.This());
            ac.setReturnValue(httpServerSecureRequestBuf->getBufLength());
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerSecureRequestBuf_getParamsBin(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerSecureRequestBuf = unwrap<HttpServerSecureRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.toBinary(httpServerSecureRequestBuf->getParamsBin(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerSecureRequestBuf_getPublicKeyBin(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto httpServerSecureRequestBuf = unwrap<HttpServerSecureRequestBuf>(ac.args.This());
            ac.setReturnValue(ac.toBinary(httpServerSecureRequestBuf->getPublicKeyBin(ac.asInt(0))));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void HttpServerSecureRequestBuf_setAnswer(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto httpServerSecureRequestBuf = unwrap<HttpServerSecureRequestBuf>(ac.args.This());
            auto contents = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
            byte_vector bv(contents.ByteLength());
            memcpy(&bv[0], contents.Data(), contents.ByteLength());
            httpServerSecureRequestBuf->setAnswer(ac.asInt(0), std::move(bv));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitHttpServerSecureRequest(Isolate *isolate, const Local<ObjectTemplate> &global) {
    // Bind object with default constructor
    Local<FunctionTemplate> tpl = bindCppClass<HttpServerSecureRequestBuf>(isolate, "HttpServerSecureRequestBuf");

    // instance methods
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    prototype->Set(isolate, "getBufLength", FunctionTemplate::New(isolate, HttpServerSecureRequestBuf_getBufLength));
    prototype->Set(isolate, "getParamsBin", FunctionTemplate::New(isolate, HttpServerSecureRequestBuf_getParamsBin));
    prototype->Set(isolate, "getPublicKeyBin", FunctionTemplate::New(isolate, HttpServerSecureRequestBuf_getPublicKeyBin));
    prototype->Set(isolate, "setAnswer", FunctionTemplate::New(isolate, HttpServerSecureRequestBuf_setAnswer));

    // register it into global namespace
    HttpServerRequestSecureBufTpl.Reset(isolate, tpl);
    global->Set(isolate, "HttpServerSecureRequestBuf", tpl);
}
