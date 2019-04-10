//
// Created by Leonid Novikov on 4/8/19.
//

#include "udp_bindings.h"
#include "binding_tools.h"
#include "../network/UDPAdapter.h"

using namespace network;
using namespace crypto;

static Persistent<FunctionTemplate> NodeInfoTpl;
static Persistent<FunctionTemplate> SocketAddressTpl;
static Persistent<FunctionTemplate> NetConfigTpl;
static Persistent<FunctionTemplate> UDPAdapterTpl;

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

void socketAddress_addNode(const FunctionCallbackInfo<Value> &args) {
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

void socketAddress_getInfo(const FunctionCallbackInfo<Value> &args) {
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

void socketAddress_find(const FunctionCallbackInfo<Value> &args) {
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

Local<FunctionTemplate> initNetConfig(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<NetConfig>(isolate, "NetConfigImpl");

    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__addNode", FunctionTemplate::New(isolate, socketAddress_addNode));
    prototype->Set(isolate, "__getInfo", FunctionTemplate::New(isolate, socketAddress_getInfo));
    prototype->Set(isolate, "__find", FunctionTemplate::New(isolate, socketAddress_find));

    NetConfigTpl.Reset(isolate, tpl);
    return tpl;
}

void udpAdapter_send(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto udpAdapter = unwrap<UDPAdapter>(ac.args.This());
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

Local<FunctionTemplate> initUDPAdapter(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<UDPAdapter>(
            isolate,
            "UDPAdapterImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> UDPAdapter* {
                if (args.Length() == 4) {
                    auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                    crypto::PrivateKey privateKey(contents.Data(), contents.ByteLength());
                    try {
                        return new UDPAdapter(
                                privateKey,                                                      // ownPrivateKey
                                args[1]->Int32Value(isolate->GetCurrentContext()).FromJust(),    // ownNodeNumber
                                *unwrap<NetConfig>(Local<Object>::Cast(args[2])),                // netConfig
                                [](const byte_vector &packet, const NodeInfo &fromNode) {
                                    printf("packet received, size=%zu\n", packet.size());
                                }
                        );
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

    UDPAdapterTpl.Reset(isolate, tpl);
    return tpl;
}

void JsInitNetwork(Isolate *isolate, const Local<ObjectTemplate> &global) {
    auto network = ObjectTemplate::New(isolate);

    network->Set(isolate, "NodeInfoImpl", initNodeInfo(isolate));
    network->Set(isolate, "SocketAddressImpl", initSocketAddress(isolate));
    network->Set(isolate, "NetConfigImpl", initNetConfig(isolate));
    network->Set(isolate, "UDPAdapterImpl", initUDPAdapter(isolate));

    global->Set(isolate, "network", network);
}
