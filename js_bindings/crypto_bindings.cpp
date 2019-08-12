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
#include "../crypto/SymmetricKey.h"
#include "../serialization/BossSerializer.h"
#include "../types/UBinder.h"
#include "../types/UDateTime.h"
#include "../types/complex/UPublicKey.h"

using namespace crypto;

static Persistent<FunctionTemplate> publicKeyTpl;
static Persistent<FunctionTemplate> privateKeyTpl;
static Persistent<FunctionTemplate> hashIdTpl;
static Persistent<FunctionTemplate> keyAddressTpl;

static void privateKeySign(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // __sign(data, hashType, callback)
        if (args.Length() == 3) {
            auto key = unwrap<PrivateKey>(args.This());
            auto data = ac.asBuffer(0);
            if (data->data() != nullptr) {
                auto isolate = ac.isolate;
                auto ht = (HashType) ac.asInt(1);
                auto onReady = ac.asFunction(2);// new Persistent<Function>(ac.isolate, ac.as<Function>(2));
                runAsync([=]() {
                    auto signature = key->sign(data->data(), data->size(), ht);
                    onReady->lockedContext([=](Local<Context> cxt) {
                        Local<Value> result = vectorToV8(isolate, signature);
                        onReady->call(cxt, 1, &result);
                    });
                });
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyDecrypt(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // __decrypt(data, callback)
        if (args.Length() == 3) {
            auto key = unwrap<PrivateKey>(args.This());
            auto data = ac.asBuffer(0);
            if (data->data() != nullptr) {
                auto isolate = ac.isolate;
                auto onReady = ac.asFunction(1);
                auto onError = ac.asFunction(2);
                auto scripter = ac.scripter;
                runAsync([=]() {
                    string errorString;
                    try {
                        auto plain = key->decrypt(data->data(), data->size());
                        scripter->lockedContext([=](Local<Context> cxt) {
                            Local<Value> result = vectorToV8(isolate, plain);
                            onReady->call(cxt, 1, &result);
                        });
                    }
                    catch (const exception &e) {
                        scripter->lockedContext([=](Local<Context> cxt) {
                            Local<Value> result = scripter->v8String(e.what());
                            onError->call(cxt, 1, &result);
                        });
                    }
                });
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyPack(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.toBinary(key->pack()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyGenerate(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 2 && args[0]->IsNumber()) {
            int strength = ac.asInt(0);
            if (strength < 2048)
                ac.throwError("strength must be at least 2048");
            else {
                auto onReady = ac.asFunction(1);
                runAsync([=]() {
                    auto key = new PrivateKey(strength);
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        onReady->call(cxt, wrap(privateKeyTpl, onReady->isolate(), key, true));
                    });
                });
                return;
            }
            ac.throwError("invalid arguments");
        }
    });
}

static void publicKeyPack(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PublicKey>(args.This());
            ac.setReturnValue(ac.toBinary(key->pack()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyVerify(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto key = unwrap<PublicKey>(ac.args.This());
            auto pdata = ac.asBuffer(0);
            auto psig = ac.asBuffer(1);
            if (psig->data() && pdata->data()) {
                auto ht = (HashType) ac.asInt(2);
                auto onReady = ac.asFunction(3);
                runAsync([=]() {
                    bool result = key->verify(psig->data(), psig->size(), pdata->data(), pdata->size(), ht);
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        onReady->invoke(Boolean::New(cxt->GetIsolate(), result));
                    });
                });
            }
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyEncrypt(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto key = unwrap<PublicKey>(ac.args.This());
            auto data = ac.asBuffer(0);
            if (data) {
                auto isolate = ac.isolate;
                auto onReady = ac.asFunction(1);
                shared_ptr<Scripter> scripter = ac.scripter;
                runAsync([=]() {
                    auto result = key->encrypt(data->data(), data->size());
                    scripter->lockedContext([=](Local<Context> cxt) {
                        Local<Value> res = vectorToV8(isolate, result);
                        onReady->call(cxt, 1, &res);
                    });
                });
                return;
            }
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyFingerprints(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto key = unwrap<PublicKey>(ac.args.This());
            ac.setReturnValue(ac.toBinary(key->fingerprint()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyBitsStrength(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto key = unwrap<PublicKey>(ac.args.This());
            ac.setReturnValue(key->getBitStrength());
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressToString(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.v8String(keyAddress->toString()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressGetPacked(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            ac.setReturnValue(ac.toBinary(keyAddress->getPacked()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void keyAddressMatch(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto keyAddress = unwrap<KeyAddress>(ac.args.This());
            auto isolate = ac.isolate;
            auto pkt = publicKeyTpl.Get(isolate);
            Local<Object> obj = ac.args[0].As<Object>();
            if (pkt->HasInstance(obj)) {
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
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto hashId = unwrap<HashId>(ac.args.This());
            ac.setReturnValue(ac.toBinary(hashId->getDigest()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void hashIdGetBase64String(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto hashId = unwrap<HashId>(ac.args.This());
            ac.setReturnValue(ac.v8String(hashId->toBase64()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void hashIdOf(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto pData = ac.asBuffer(0);
            auto onReady = ac.asFunction(1);
            runAsync([=]() {
                auto h = new HashId(HashId::of(pData->data(), pData->size()));
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(wrap(hashIdTpl, onReady->isolate(), h, true));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initPrivateKey(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PrivateKey>(
            isolate,
            "PrivateKeyImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> PrivateKey * {
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        // load from packed
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
    prototype->Set(isolate, "__decrypt", FunctionTemplate::New(isolate, privateKeyDecrypt));

    tpl->Set(isolate, "__generate", FunctionTemplate::New(isolate, privateKeyGenerate));

    privateKeyTpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initPublicKey(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PublicKey>(
            isolate,
            "PublicKeyImpl",
            [](const FunctionCallbackInfo<Value> &args) -> PublicKey * {
                Isolate *isolate = args.GetIsolate();
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        return new PublicKey(contents.Data(), contents.ByteLength());
                    } else if (args[0]->IsObject()) {
                        auto pkt = privateKeyTpl.Get(isolate);
                        Local<Object> obj = args[0].As<Object>();
                        if (pkt->HasInstance(obj))
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
    prototype->Set(isolate, "__getBitsStrength", FunctionTemplate::New(isolate, publicKeyBitsStrength));
    prototype->Set(isolate, "__encrypt", FunctionTemplate::New(isolate, publicKeyEncrypt));

    publicKeyTpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initKeyAddress(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<KeyAddress>(
            isolate,
            "KeyAddress",
            [](const FunctionCallbackInfo<Value> &args) -> KeyAddress * {
                auto isolate = args.GetIsolate();
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
                    auto tpl = publicKeyTpl.Get(isolate);
                    if (tpl->HasInstance(obj)) {
                        auto context = args.GetIsolate()->GetCurrentContext();
                        return new KeyAddress(*unwrap<PrivateKey>(obj),
                                              args[1]->Int32Value(context).FromJust(),
                                              args[2]->BooleanValue(isolate));
                    }
                    isolate->ThrowException(
                            Exception::TypeError(String::NewFromUtf8(isolate, "public key expected")));
                    return nullptr;

                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "toString", FunctionTemplate::New(isolate, keyAddressToString));
    prototype->Set(isolate, "getPacked", FunctionTemplate::New(isolate, keyAddressGetPacked));
    prototype->Set(isolate, "match", FunctionTemplate::New(isolate, keyAddressMatch));

    keyAddressTpl.Reset(isolate, tpl);
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

    tpl->Set(isolate, "__of", FunctionTemplate::New(isolate, hashIdOf));

    hashIdTpl.Reset(isolate, tpl);
    return tpl;
}


static void symmetricKeyEncrypt(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1 && ac.args[0]->IsTypedArray()) {
            auto key = unwrap<SymmetricKey>(ac.args.This());
            auto c = ac.as<TypedArray>(0)->Buffer()->GetContents();
            auto data = c.Data();
            auto size = c.ByteLength();
            ac.setReturnValue(ac.toBinary(key->etaEncrypt(data, size)));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void symmetricKeyDecrypt(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1 && ac.args[0]->IsTypedArray()) {
            auto key = unwrap<SymmetricKey>(ac.args.This());
            auto c = ac.as<TypedArray>(0)->Buffer()->GetContents();
            auto data = c.Data();
            auto size = c.ByteLength();
            ac.setReturnValue(ac.toBinary(key->etaDecrypt(data, size)));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void symmetricKeyPack(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto key = unwrap<SymmetricKey>(ac.args.This());
            ac.setReturnValue(ac.toBinary(key->pack()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

/**
 * Symmetric key constructor:
 * \code
 *  new SymmetricKey();       // random
 *  new SymmetricKey(packed); // existing key
 * \endcode
 * @param isolate
 * @return
 */
Local<FunctionTemplate> initSymmetricKey(Isolate *isolate) {
    Local<FunctionTemplate>
            tpl = bindCppClass<SymmetricKey>(
            isolate,
            "SymmetricKey",
            [=](const FunctionCallbackInfo<Value> &args) -> SymmetricKey * {
                switch (args.Length()) {
                    case 1:
                        if (args[0]->IsTypedArray()) {
                            // great, we will construct it therefore
                            auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                            void *data = contents.Data();
                            size_t size = contents.ByteLength();
                            return new SymmetricKey(data, size);
                        } else {
                            isolate->ThrowException(
                                    Exception::TypeError(String::NewFromUtf8(isolate, "typed data array expected")));
                            return nullptr;
                        }
                    case 0:
                        return new SymmetricKey();
                    default:
                        break;
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "etaEncrypt", FunctionTemplate::New(isolate, symmetricKeyEncrypt));
    prototype->Set(isolate, "etaDecrypt", FunctionTemplate::New(isolate, symmetricKeyDecrypt));
    prototype->Set(isolate, "getPacked", FunctionTemplate::New(isolate, symmetricKeyPack));
    return tpl;
}


static void JsA2B(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            ac.setReturnValue(ac.toBinary(base64_decodeToBytes(ac.asString(0))));
        } else
            ac.throwError("one argument required");
    });
}

static void JsB2A(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
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
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
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

static void JsVerifyExtendedSignature(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto pubKey = unwrap<PublicKey>(Local<Object>::Cast(ac.args[0]));
            auto sig = ac.asBuffer(1);
            auto data = ac.asBuffer(2);
            auto onComplete = ac.asFunction(3);
            runAsync([pubKey,sig,data,onComplete](){
                try {
                    byte_vector bvSig(sig->size());
                    memcpy(&bvSig[0], sig->data(), sig->size());
                    UBytes sigUBytes = UBytes(move(bvSig));
                    UObject src = BossSerializer::deserialize(sigUBytes);
                    UBinder srcBinder = UBinder::asInstance(src);
                    byte_vector srcExts = UBytes::asInstance(srcBinder.get("exts")).get();
                    byte_vector srcSign = UBytes::asInstance(srcBinder.get("sign")).get();
                    bool isSignValid = pubKey->verify(srcSign, srcExts, HashType::SHA512);
                    bool isSign2Valid = true;
                    if (srcBinder.find(string("sign2")) != srcBinder.end()) {
                        byte_vector srcSign2 = UBytes::asInstance(srcBinder.get("sign2")).get();
                        isSign2Valid = pubKey->verify(srcSign2, srcExts, HashType::SHA3_256);
                    }
                    bool isSign3Valid = true;
                    if (srcBinder.find(string("sign3")) != srcBinder.end()) {
                        byte_vector srcSign3 = UBytes::asInstance(srcBinder.get("sign3")).get();
                        isSign3Valid = pubKey->verify(srcSign3, srcExts, HashType::SHA3_384);
                    }
                    if (isSignValid && isSign2Valid && isSign3Valid) {
                        UBinder es;
                        UObject bo = BossSerializer::deserialize(UBytes(move(srcExts)));
                        UBinder b = UBinder::asInstance(bo);
                        es.set("keyId", UBytes::asInstance(b.get("key")));
                        es.set("createdAt", UDateTime::asInstance(b.get("created_at")));
                        es.set("signature", sigUBytes);
                        if (b.find(string("pub_key")) != b.end()) {
                            PublicKey publicKey(UBytes::asInstance(b.get("pub_key")).get());
                            es.set("publicKey", UPublicKey(publicKey));
                        } else {
                            es.set("publicKey", UObject());
                        }
                        byte_vector hash = UBytes::asInstance(b.get("sha512")).get();
                        byte_vector dataHash = crypto::Digest(crypto::HashType::SHA512, data->data(),
                                                              data->size()).getDigest();
                        bool isHashValid = (hash == dataHash);
                        bool isHash2Valid = true;
                        if (b.find(string("sha3_384")) != b.end()) {
                            byte_vector hash1 = UBytes::asInstance(b.get("sha3_384")).get();
                            byte_vector dataHash1 = crypto::Digest(crypto::HashType::SHA3_384, data->data(),
                                                                  data->size()).getDigest();
                            isHash2Valid = (hash1 == dataHash1);
                        }
                        bool isAllOk = isHashValid && isHash2Valid;
                        onComplete->lockedContext([isAllOk, es, onComplete](Local<Context> cxt) {
                            if (isAllOk) {
                                onComplete->invoke(es.serializeToV8(cxt->GetIsolate()));
                            } else {
                                onComplete->invoke(UObject().serializeToV8(cxt->GetIsolate()));
                            }
                        });
                    }
                } catch (const std::exception& e) {
                    cerr << "JsVerifyExtendedSignature error: " << e.what() << endl;
                    onComplete->lockedContext([onComplete](Local<Context> cxt) {
                        onComplete->invoke(UObject().serializeToV8(cxt->GetIsolate()));
                    });
                }
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitCrypto(Isolate *isolate, const Local<ObjectTemplate> &global) {
    auto crypto = ObjectTemplate::New(isolate);

    // order is critical!
    crypto->Set(isolate, "PrivateKeyImpl", initPrivateKey(isolate));
    crypto->Set(isolate, "PublicKeyImpl", initPublicKey(isolate));
    crypto->Set(isolate, "KeyAddress", initKeyAddress(isolate));
    crypto->Set(isolate, "SymmetricKeyImpl", initSymmetricKey(isolate));
    // endo of critical order
    crypto->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1"));
    crypto->Set(isolate, "HashIdImpl", initHashId(isolate));
    crypto->Set(isolate, "__digest", FunctionTemplate::New(isolate, digest));

    global->Set(isolate, "crypto", crypto);

    global->Set(isolate, "atob", FunctionTemplate::New(isolate, JsA2B));
    global->Set(isolate, "btoa", FunctionTemplate::New(isolate, JsB2A));

    global->Set(isolate, "__verify_extendedSignature", FunctionTemplate::New(isolate, JsVerifyExtendedSignature));
}

v8::Local<v8::Value> wrapHashId(v8::Isolate* isolate, crypto::HashId* hashId) {
    return wrap(hashIdTpl, isolate, hashId, true);
}

v8::Local<v8::Value> wrapKeyAddress(v8::Isolate* isolate, crypto::KeyAddress* keyAddress) {
    return wrap(keyAddressTpl, isolate, keyAddress, true);
}

v8::Local<v8::Value> wrapPublicKey(v8::Isolate* isolate, crypto::PublicKey* publicKey) {
    return wrap(publicKeyTpl, isolate, publicKey, true);
}

v8::Local<v8::Value> wrapPrivateKey(v8::Isolate* isolate, crypto::PrivateKey* privateKey) {
    return wrap(privateKeyTpl, isolate, privateKey, true);
}
