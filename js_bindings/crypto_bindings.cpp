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
#include "../crypto/HashId.h"

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
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 3) {
            auto key = unwrap<PublicKey>(ac.args.This());
            optional<byte_vector> src = v8ToVector(ac.args[0]);
            optional<byte_vector> signature = v8ToVector(ac.args[1]);
            if (src && signature) {
                ac.setReturnValue(key->verify(*signature, *src, (HashType) ac.asInt(2)));
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyFingerprints(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 0) {
            auto key = unwrap<PublicKey>(ac.args.This());
            ac.setReturnValue(ac.toBinary(key->fingerprint()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressToString(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.v8String(keyAddress->toString()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressGetPacked(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.toBinary(keyAddress->getPacked()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressMatch(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 1) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            auto isolate = ac.isolate;
            Local<Object> obj = ac.args[0].As<Object>();
            String::Utf8Value className(isolate, obj->GetConstructorName());
            if (strcmp(*className, "PublicKey") == 0) {
                PublicKey *key = unwrap<PublicKey>(obj);
                ac.setReturnValue(keyAddress->isMatchingKey(*key));
                return;;
            }
            isolate->ThrowException(
                    Exception::TypeError(String::NewFromUtf8(isolate, "public key expected")));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void hashIdGetDigest(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 0) {
            auto hashId = unwrap<HashId>(ac.args.This());
            ac.setReturnValue(ac.toBinary(hashId->getDigest()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void hashIdGetBase64String(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 0) {
            auto hashId = unwrap<HashId>(ac.args.This());
            ac.setReturnValue(ac.v8String(hashId->toBase64()));
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
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        return new PrivateKey(contents.Data(), contents.ByteLength());
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
            [=](const FunctionCallbackInfo<Value> &args) -> KeyAddress * {
                auto a0 = args[0];
                if (a0->IsTypedArray() && args.Length() == 1) {
                    // TODO: reuse data of the typed array
                    auto v = v8ToVector(a0);
                    if (v)
                        return new KeyAddress(*v);
                } else if (a0->IsString() && args.Length() == 1) {
                    String::Utf8Value s(isolate, a0);
                    return new KeyAddress(*s);
                } else if (a0->IsObject() && args.Length() == 3) {
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
    prototype->Set(isolate, "match", FunctionTemplate::New(isolate, keyAddressMatch));
    return tpl;
}


Local<FunctionTemplate> initPublicKey(Isolate *isolate, Local<FunctionTemplate> privateKeyTemplate) {
    static Persistent<FunctionTemplate> pkt;
    pkt.Reset(isolate, privateKeyTemplate);
    Local<FunctionTemplate> tpl = bindCppClass<PublicKey>(
            isolate,
            "PrivateKey",
            [](const FunctionCallbackInfo<Value> &args) -> PublicKey * {
                Isolate *isolate = args.GetIsolate();
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        return new PublicKey(contents.Data(), contents.ByteLength());
                    } else if (args[0]->IsObject()) {
                        auto
                        privateKeyTemplate = pkt.Get(isolate);
                        Local<Object> obj = args[0].As<Object>();
                        if( privateKeyTemplate->HasInstance(obj) )
                            return new PublicKey(*unwrap<PrivateKey>(obj));
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "private key expected")));
                    }
                }
                cout << "error1\n";
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__verify", FunctionTemplate::New(isolate, publicKeyVerify));
    prototype->Set(isolate, "__pack", FunctionTemplate::New(isolate, publicKeyPack));
    prototype->Set(isolate, "__getFingerprints", FunctionTemplate::New(isolate, publicKeyFingerprints));
    return tpl;
}

/*
 * constructor: new HashId(data, isDigest)
 */
Local<FunctionTemplate> initHashId(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<HashId>(
            isolate,
            "HashIdImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> HashId * {
                if (args.Length() == 2) {
                    bool isDigest = args[0]->BooleanValue(isolate);
                    if (args[1]->IsTypedArray()) {
                        // great, we will construct it therefore
                        auto contents = args[1].As<TypedArray>()->Buffer()->GetContents();
                        void *data = contents.Data();
                        size_t size = contents.ByteLength();
                        return new HashId(isDigest ? HashId::withDigest(data, size) : HashId::of(data, size));
                    } else {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "typed data array expected")));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__getDigest", FunctionTemplate::New(isolate, hashIdGetDigest));
    prototype->Set(isolate, "__getBase64String", FunctionTemplate::New(isolate, hashIdGetBase64String));
    return tpl;
}

static void JsA2B(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 1) {
            ac.setReturnValue(ac.toBinary(base64_decodeToBytes(ac.asString(0))));
        } else
            ac.throwError("one argument required");
    });
}

static void JsB2A(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 1) {
            if (ac.args[0]->IsUint8Array()) {
                auto c = ac.args[0].As<Uint8Array>()->Buffer()->GetContents();
                ac.setReturnValue(ac.v8String(base64_encode((unsigned char const *) c.Data(), c.ByteLength())));
            } else
                ac.throwError("Uint8Array required");
        } else
            ac.throwError("one argument required");
    });
}

static void digest(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &&ac) {
        if (ac.args.Length() == 2) {
            int ht = ac.asInt(0);
            if (ht <= HashType::MIN || ht >= HashType::MAX)
                ac.throwError("illegal hash type");
            else {
                if (ac.args[1]->IsTypedArray()) {
                    auto contents = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
                    byte_vector result = Digest((HashType) ht, contents.Data(), contents.ByteLength()).getDigest();
                    ac.setReturnValue(ac.toBinary(result));
                    return;
                } else
                    ac.throwError("typed array required");
            }
        } else
            ac.throwError("two arguments required");

    });
}


void JsInitCrypto(Isolate *isolate, const Local<ObjectTemplate> &global) {
    auto crypto = ObjectTemplate::New(isolate);
    auto privateKey = initPrivateKey(isolate);
    crypto->Set(isolate, "PrivateKeyImpl", privateKey);
    crypto->Set(isolate, "PublicKey", initPublicKey(isolate, privateKey));
    crypto->Set(isolate, "KeyAddress", initKeyAddress(isolate));
    crypto->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    crypto->Set(isolate, "HashIdImpl", initHashId(isolate));
    crypto->Set(isolate, "__digest", FunctionTemplate::New(isolate, digest));

    global->Set(isolate, "crypto", crypto);

    global->Set(isolate, "atob", FunctionTemplate::New(isolate, JsA2B));
    global->Set(isolate, "btoa", FunctionTemplate::New(isolate, JsB2A));
}


