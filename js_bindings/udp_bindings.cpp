//
// Created by Leonid Novikov on 4/8/19.
//

#include "udp_bindings.h"
#include "binding_tools.h"
#include "../network/UDPAdapter.h"

using namespace network;
using namespace crypto;

static Persistent<FunctionTemplate> NodeInfoTpl;
static Persistent<FunctionTemplate> UDPAdapterTemplate;

static void nodeInfoGetNumber(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto nodeInfo = unwrap<NodeInfo>(ac.args.This());
            ac.setReturnValue(nodeInfo->getNumber());
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
    prototype->Set(isolate, "__getNumber", FunctionTemplate::New(isolate, nodeInfoGetNumber));

    NodeInfoTpl.Reset(isolate, tpl);
    return tpl;
}

void JsInitNetwork(Isolate *isolate, const Local<ObjectTemplate> &global) {
    auto network = ObjectTemplate::New(isolate);

    network->Set(isolate, "NodeInfoImpl", initNodeInfo(isolate));

    global->Set(isolate, "network", network);
}
