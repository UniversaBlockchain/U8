//
// Created by Sergey Chernov on 2019-01-29.
//
#include <optional>
#include <string.h>

#include "binding_tools.h"
#include "../tools/tools.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"
#include "Scripter.h"
#include "../tools/vprintf.h"

static void privateKeySign(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &&ac) {
        if (args.Length() == 2) {
            auto key = unwrap<PrivateKey>(args.This());
            optional<byte_vector> src = v8ToVector(args[0]);
            if (src) {
                byte_vector result;
                key->sign(*src, (HashType) ac.asInt(1), result);
                args.GetReturnValue().Set(ac.toBinary(result));
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyVerify(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext&& ac) {
        if( ac.args.Length() == 3) {
            auto key = unwrap<PublicKey>(ac.args.This());
            optional<byte_vector> src = v8ToVector(ac.args[0]);
            optional<byte_vector> signature = v8ToVector(ac.args[1]);
            if( src && signature ) {
                ac.setReturnValue(key->verify(*signature, *src, (HashType)ac.asInt(2) ));
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}


Local<FunctionTemplate> initPrivateKey(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PrivateKey>(
            isolate,
            "PrivateKey",
            [=](const FunctionCallbackInfo<Value> &args) -> PrivateKey * {
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        // TODO: reuse data of the typed array
                        auto v = v8ToVector(args[0]);
                        if (v)
                            return new PrivateKey(*v);
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__sign", FunctionTemplate::New(isolate, privateKeySign));
    return tpl;
}

Local<FunctionTemplate> initPublicKey(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PublicKey>(
            isolate,
            "PrivateKey",
            [=](const FunctionCallbackInfo<Value> &args) -> PublicKey * {
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        // TODO: reuse data of the typed array
                        auto v = v8ToVector(args[0]);
                        if (v)
                            return new PublicKey(*v);
                    } else if (args[0]->IsObject()) {
                        Local<Object> obj = args[0].As<Object>();
                        String::Utf8Value className(isolate, obj->GetConstructorName());
                        if (strcmp(*className, "PrivateKey") == 0) {
                            return new PublicKey(*unwrap<PrivateKey>(obj));
                        }
                        cout << "OBJECT! " << *className << endl;
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "private key expected")));

                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__verify", FunctionTemplate::New(isolate, publicKeyVerify));
    return tpl;
}

void JsInitCrypto(Isolate *isolate, const Local<ObjectTemplate> &global) {
//    auto prototype = tpl->PrototypeTemplate();prototype->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
//    prototype->Set(isolate, "open", FunctionTemplate::New(isolate, JsAsyncHandleOpen));
//    prototype->Set(isolate, "_read_raw", FunctionTemplate::New(isolate, JsAsyncHandleRead));
//    prototype->Set(isolate, "_write_raw", FunctionTemplate::New(isolate, JsAsyncHandleWrite));
//    prototype->Set(isolate, "_close_raw", FunctionTemplate::New(isolate, JsAsyncHandleClose));

    // class methods
//    tpl->Set(isolate, "getErrorText", FunctionTemplate::New(isolate, JsAsyncGetErrorText));

    // register it into global namespace
    auto crypto = ObjectTemplate::New(isolate);
    crypto->Set(isolate, "PrivateKey", initPrivateKey(isolate));
    crypto->Set(isolate, "PublicKey", initPublicKey(isolate));
    crypto->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    global->Set(isolate, "crypto", crypto);

}


