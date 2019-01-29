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
#include "../crypto/base64.h"

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

static void privateKeyPack(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &&ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.toBinary(key->pack()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyPack(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &&ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PublicKey>(args.This());
            ac.setReturnValue(ac.toBinary(key->pack()));
            return;
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

static void keyAddressToString(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext&& ac) {
        if( ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.v8String(keyAddress->toString()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressGetPacked(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext&& ac) {
        if( ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.toBinary(keyAddress->getPacked()));
            return;
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
    prototype->Set(isolate, "__pack", FunctionTemplate::New(isolate, privateKeyPack));
    return tpl;
}

Local<FunctionTemplate> initKeyAddress(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<KeyAddress>(
            isolate,
            "KeyAddress",
            [=](const FunctionCallbackInfo<Value> &args) -> KeyAddress* {
                    auto a0 = args[0];
                    if (a0->IsTypedArray() && args.Length() == 1) {
                        // TODO: reuse data of the typed array
                        auto v = v8ToVector(a0);
                        if (v)
                            return new KeyAddress(*v);
                    }
                    else if( a0->IsString() && args.Length() == 1 ) {
                        String::Utf8Value s(isolate, a0);
                        return new KeyAddress(*s);
                    }
                    else if( a0->IsObject() && args.Length() == 3 ) {
                        Local<Object> obj = a0.As<Object>();
                        String::Utf8Value className(isolate, obj->GetConstructorName());
                        if (strcmp(*className, "PublicKey") == 0) {
                            auto context = args.GetIsolate()->GetCurrentContext();
                            return new KeyAddress(*unwrap<PrivateKey>(obj),
                                    args[1]->Int32Value(context).FromJust(),
                                    args[2]->BooleanValue(isolate));
                        }
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "public key expected")));

                    }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "toString", FunctionTemplate::New(isolate, keyAddressToString));
    prototype->Set(isolate, "getPacked", FunctionTemplate::New(isolate, keyAddressGetPacked));
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
    prototype->Set(isolate, "__pack", FunctionTemplate::New(isolate, publicKeyPack));
    return tpl;
}

static void JsA2B(const FunctionCallbackInfo<Value>& args) {
    Scripter::unwrapArgs(args, [](ArgsContext&& ac) {
        if( ac.args.Length() == 1) {
            ac.setReturnValue(ac.toBinary(base64_decodeToBytes(ac.asString(0))));
        }
        else
            ac.throwError("one argument required");
    });
}

static void JsB2A(const FunctionCallbackInfo<Value>& args) {
    Scripter::unwrapArgs(args, [](ArgsContext&& ac) {
        if( ac.args.Length() == 1) {
            if( ac.args[0]->IsUint8Array() ) {
                auto c = ac.args[0].As<Uint8Array>()->Buffer()->GetContents();
                ac.setReturnValue(ac.v8String(base64_encode((unsigned char const*)c.Data(), c.ByteLength())));
            }
            else
                ac.throwError("Uint8Array required");
        }
        else
            ac.throwError("one argument required");
    });
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
    crypto->Set(isolate, "KeyAddress", initKeyAddress(isolate));
    crypto->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    global->Set(isolate, "crypto", crypto);

    global->Set(isolate, "atob", FunctionTemplate::New(isolate, JsA2B));
    global->Set(isolate, "btoa", FunctionTemplate::New(isolate, JsB2A));
}


