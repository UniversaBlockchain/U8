/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

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
#include "../crypto/PBKDF2.h"
#include "../serialization/BossSerializer.h"
#include "../types/UBinder.h"
#include "../types/UDateTime.h"
#include "../types/complex/UPublicKey.h"

using namespace crypto;

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

static void privateKeySignEx(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // __sign(data, hashType, callback)
        if (args.Length() == 5) {
            auto key = unwrap<PrivateKey>(args.This());
            auto data = ac.asBuffer(0);
            if (data->data() != nullptr) {
                auto isolate = ac.isolate;
                auto ht = (HashType) ac.asInt(1);
                auto ht_mgf1 = (HashType) ac.asInt(2);
                auto saltLen = (HashType) ac.asInt(3);
                auto onReady = ac.asFunction(4);
                runAsync([=]() {
                    auto signature = key->signEx(data->data(), data->size(), ht, ht_mgf1, saltLen);
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

static void privateKeySignExWithCustomSalt(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // __sign(data, hashType, callback)
        if (args.Length() == 5) {
            auto key = unwrap<PrivateKey>(args.This());
            auto data = ac.asBuffer(0);
            auto salt = ac.asBuffer(3);
            if ((data->data() != nullptr) && (salt->data() != nullptr)) {
                auto isolate = ac.isolate;
                auto ht = (HashType) ac.asInt(1);
                auto ht_mgf1 = (HashType) ac.asInt(2);
                auto saltLen = (HashType) ac.asInt(3);
                auto onReady = ac.asFunction(4);
                runAsync([=]() {
                    auto signature = key->signExWithCustomSalt(data->data(), data->size(), ht, ht_mgf1, salt->data(), salt->size());
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

static void privateKeyDecryptEx(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        // __decrypt(data, callback)
        if (args.Length() == 4) {
            auto key = unwrap<PrivateKey>(args.This());
            auto data = ac.asBuffer(0);
            int oaepHashType = ac.asInt(1);
            if (data->data() != nullptr) {
                auto isolate = ac.isolate;
                auto onReady = ac.asFunction(2);
                auto onError = ac.asFunction(3);
                auto scripter = ac.scripter;
                runAsync([=]() {
                    string errorString;
                    try {
                        auto plain = key->decryptEx(data->data(), data->size(), oaepHashType);
                        scripter->lockedContext([=](Local<Context> cxt) {
                            Local<Value> result = vectorToV8(isolate, plain);
                            onReady->call(cxt, 1, &result);
                        });
                    }
                    catch (const exception &e) {
                        std::string errorText(e.what());
                        scripter->lockedContext([=](Local<Context> cxt) {
                            Local<Value> result = scripter->v8String(errorText);
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

static void privateKeyGetE(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.v8String(key->get_e()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyGetP(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.v8String(key->get_p()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyGetQ(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.v8String(key->get_q()));
            return;
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

static void privateKeyPackWithPassword(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 2) {
            auto passwordString = ac.asString(0);
            int rounds = ac.asInt(1);
            auto key = unwrap<PrivateKey>(args.This());
            ac.setReturnValue(ac.toBinary(key->packWithPassword(passwordString, rounds)));
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
                auto se = ac.scripter;
                runAsync([=]() {
                    auto key = new PrivateKey(strength);
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        onReady->call(cxt, wrap(se->privateKeyTpl, onReady->isolate(), key, true));
                    });
                });
                return;
            }
            ac.throwError("invalid arguments");
        }
    });
}

static void privateKeyUnpackWithPassword(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 3 && args[0]->IsUint8Array() && args[1]->IsString()) {
            auto packedBinary = ac.asBuffer(0);
            auto passwordString = ac.asString(1);
            auto onReady = ac.asFunction(2);
            auto se = ac.scripter;
            runAsync([=]() {
                try {
                    byte_vector bv(packedBinary->size());
                    memcpy(&bv[0], packedBinary->data(), packedBinary->size());
                    auto key = PrivateKey::unpackWithPassword(bv, passwordString);
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        Local<Value> res[2];
                        res[0] = Local<Object>::Cast(String::NewFromUtf8(cxt->GetIsolate(), "").ToLocalChecked());
                        res[1] = wrap(se->privateKeyTpl, onReady->isolate(), new PrivateKey(key), true);
                        onReady->invoke(2, res);
                    });
                } catch (const std::exception& e) {
                    std::string errText(e.what());
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        Local<Value> res[2];
                        res[0] = Local<Object>::Cast(String::NewFromUtf8(cxt->GetIsolate(), errText.data()).ToLocalChecked());
                        res[1] = Local<Object>::Cast(Null(cxt->GetIsolate()));
                        onReady->invoke(2, res);
                    });
                }
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void privateKeyInitFromHexExponents(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 4) {
            auto strE = ac.asString(0);
            auto strP = ac.asString(1);
            auto strQ = ac.asString(2);
            auto onReady = ac.asFunction(3);
            auto se = ac.scripter;
            runAsync([=]() {
                try {
                    auto key = PrivateKey::unpackFromHexStrings(strE, strP, strQ);
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        Local<Value> res[2];
                        res[0] = Local<Object>::Cast(String::NewFromUtf8(cxt->GetIsolate(), "").ToLocalChecked());
                        res[1] = wrap(se->privateKeyTpl, onReady->isolate(), new PrivateKey(key), true);
                        onReady->invoke(2, res);
                    });
                } catch (const std::exception& e) {
                    std::string errText(e.what());
                    onReady->lockedContext([=](Local<Context> &cxt) {
                        Local<Value> res[2];
                        res[0] = Local<Object>::Cast(String::NewFromUtf8(cxt->GetIsolate(), errText.data()).ToLocalChecked());
                        res[1] = Local<Object>::Cast(Null(cxt->GetIsolate()));
                        onReady->invoke(2, res);
                    });
                }
            });
            return;
        }
        ac.throwError("invalid arguments");
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

static void publicKeyVerifyEx(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 6) {
            auto key = unwrap<PublicKey>(ac.args.This());
            auto pdata = ac.asBuffer(0);
            auto psig = ac.asBuffer(1);
            if (psig->data() && pdata->data()) {
                auto pssHashType = (HashType) ac.asInt(2);
                auto mgf1HashType = (HashType) ac.asInt(3);
                auto saltLen = (HashType) ac.asInt(4);
                auto onReady = ac.asFunction(5);
                runAsync([=]() {
                    bool result = key->verifyEx(psig->data(), psig->size(), pdata->data(), pdata->size(), pssHashType, mgf1HashType, saltLen);
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

static void publicKeyEncryptEx(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto key = unwrap<PublicKey>(ac.args.This());
            auto data = ac.asBuffer(0);
            int oaepHashType = ac.asInt(1);
            if (data) {
                auto isolate = ac.isolate;
                auto onReady = ac.asFunction(2);
                shared_ptr<Scripter> scripter = ac.scripter;
                runAsync([=]() {

                    auto result = key->encryptEx(data->data(), data->size(), oaepHashType);
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

static void publicKeyEncryptExWithSeed(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto key = unwrap<PublicKey>(ac.args.This());
            auto data = ac.asBuffer(0);
            int oaepHashType = ac.asInt(1);
            auto customSeed = ac.asBuffer(2);
            if (data) {
                auto isolate = ac.isolate;
                auto onReady = ac.asFunction(3);
                shared_ptr<Scripter> scripter = ac.scripter;
                runAsync([=]() {

                    auto result = key->encryptExWithSeed(data->data(), data->size(), oaepHashType, customSeed->data(), customSeed->size());
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

static void publicKeyGetE(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PublicKey>(args.This());
            ac.setReturnValue(ac.v8String(key->get_e()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void publicKeyGetN(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [&](ArgsContext &ac) {
        if (args.Length() == 0) {
            auto key = unwrap<PublicKey>(args.This());
            ac.setReturnValue(ac.v8String(key->get_n()));
            return;
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
            auto pkt = ac.scripter->publicKeyTpl.Get(isolate);
            Local<Object> obj = ac.args[0].As<Object>();
            if (pkt->HasInstance(obj)) {
                PublicKey *key = unwrap<PublicKey>(obj);
                ac.setReturnValue(keyAddress->isMatchingKey(*key));
                return;;
            }
            isolate->ThrowException(
                    Exception::TypeError(String::NewFromUtf8(isolate, "public key expected").ToLocalChecked()));
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
            auto se = ac.scripter;
            runAsync([=]() {
                auto h = new HashId(HashId::of(pData->data(), pData->size()));
                onReady->lockedContext([=](Local<Context> &cxt){
                    onReady->invoke(wrap(se->hashIdTpl, onReady->isolate(), h, true));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initPrivateKey(Scripter& scripter, Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PrivateKey>(
            isolate,
            "PrivateKeyImpl",
            [](const FunctionCallbackInfo<Value> &args) -> PrivateKey * {
                Isolate *isolate = args.GetIsolate();
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        // load from packed
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        return new PrivateKey(contents.Data(), contents.ByteLength());
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__sign", FunctionTemplate::New(isolate, privateKeySign));
    prototype->Set(isolate, "__signEx", FunctionTemplate::New(isolate, privateKeySignEx));
    prototype->Set(isolate, "__signExWithCustomSalt", FunctionTemplate::New(isolate, privateKeySignExWithCustomSalt));
    prototype->Set(isolate, "__pack", FunctionTemplate::New(isolate, privateKeyPack));
    prototype->Set(isolate, "__packWithPassword", FunctionTemplate::New(isolate, privateKeyPackWithPassword));
    prototype->Set(isolate, "__decrypt", FunctionTemplate::New(isolate, privateKeyDecrypt));
    prototype->Set(isolate, "__decryptEx", FunctionTemplate::New(isolate, privateKeyDecryptEx));
    prototype->Set(isolate, "__get_e", FunctionTemplate::New(isolate, privateKeyGetE));
    prototype->Set(isolate, "__get_p", FunctionTemplate::New(isolate, privateKeyGetP));
    prototype->Set(isolate, "__get_q", FunctionTemplate::New(isolate, privateKeyGetQ));

    tpl->Set(isolate, "__generate", FunctionTemplate::New(isolate, privateKeyGenerate));
    tpl->Set(isolate, "__unpackWithPassword", FunctionTemplate::New(isolate, privateKeyUnpackWithPassword));
    tpl->Set(isolate, "__initFromHexExponents", FunctionTemplate::New(isolate, privateKeyInitFromHexExponents));

    scripter.privateKeyTpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initPublicKey(Scripter& scripter, Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<PublicKey>(
            isolate,
            "PublicKeyImpl",
            [](const FunctionCallbackInfo<Value> &args) -> PublicKey * {
                Isolate *isolate = args.GetIsolate();
                Scripter* pse = (Scripter*)isolate->GetData(0);
                if (args.Length() == 1) {
                    if (args[0]->IsTypedArray()) {
                        auto contents = args[0].As<TypedArray>()->Buffer()->GetContents();
                        return new PublicKey(contents.Data(), contents.ByteLength());
                    } else if (args[0]->IsObject()) {
                        auto pkt = pse->privateKeyTpl.Get(isolate);
                        Local<Object> obj = args[0].As<Object>();
                        if (pkt->HasInstance(obj))
                            return new PublicKey(*unwrap<PrivateKey>(obj));
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, "private key expected").ToLocalChecked()));
                    }
                }
                cout << "error1\n";
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__verify", FunctionTemplate::New(isolate, publicKeyVerify));
    prototype->Set(isolate, "__verifyEx", FunctionTemplate::New(isolate, publicKeyVerifyEx));
    prototype->Set(isolate, "__pack", FunctionTemplate::New(isolate, publicKeyPack));
    prototype->Set(isolate, "__getFingerprints", FunctionTemplate::New(isolate, publicKeyFingerprints));
    prototype->Set(isolate, "__getBitsStrength", FunctionTemplate::New(isolate, publicKeyBitsStrength));
    prototype->Set(isolate, "__encrypt", FunctionTemplate::New(isolate, publicKeyEncrypt));
    prototype->Set(isolate, "__encryptEx", FunctionTemplate::New(isolate, publicKeyEncryptEx));
    prototype->Set(isolate, "__encryptExWithSeed", FunctionTemplate::New(isolate, publicKeyEncryptExWithSeed));
    prototype->Set(isolate, "__get_e", FunctionTemplate::New(isolate, publicKeyGetE));
    prototype->Set(isolate, "__get_n", FunctionTemplate::New(isolate, publicKeyGetN));

    scripter.publicKeyTpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initKeyAddress(Scripter& scripter, Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<KeyAddress>(
            isolate,
            "KeyAddress",
            [](const FunctionCallbackInfo<Value> &args) -> KeyAddress * {
                auto isolate = args.GetIsolate();
                Scripter* pse = (Scripter*)isolate->GetData(0);
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
                    auto tpl = pse->publicKeyTpl.Get(isolate);
                    if (tpl->HasInstance(obj)) {
                        auto context = args.GetIsolate()->GetCurrentContext();
                        return new KeyAddress(*unwrap<PrivateKey>(obj),
                                              args[1]->Int32Value(context).FromJust(),
                                              args[2]->BooleanValue(isolate));
                    }
                    isolate->ThrowException(
                            Exception::TypeError(String::NewFromUtf8(isolate, "public key expected").ToLocalChecked()));
                    return nullptr;

                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "toString", FunctionTemplate::New(isolate, keyAddressToString));
    prototype->Set(isolate, "getPacked", FunctionTemplate::New(isolate, keyAddressGetPacked));
    prototype->Set(isolate, "match", FunctionTemplate::New(isolate, keyAddressMatch));

    scripter.keyAddressTpl.Reset(isolate, tpl);
    return tpl;
}

/*
 * constructor: new HashId(data, isDigest)
 */
Local<FunctionTemplate> initHashId(Scripter& scripter, Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<HashId>(
            isolate,
            "HashIdImpl",
            [](const FunctionCallbackInfo<Value> &args) -> HashId * {
                auto isolate = args.GetIsolate();
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
                                Exception::TypeError(String::NewFromUtf8(isolate, "typed data array expected").ToLocalChecked()));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__getDigest", FunctionTemplate::New(isolate, hashIdGetDigest));
    prototype->Set(isolate, "__getBase64String", FunctionTemplate::New(isolate, hashIdGetBase64String));

    tpl->Set(isolate, "__of", FunctionTemplate::New(isolate, hashIdOf));

    scripter.hashIdTpl.Reset(isolate, tpl);
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
                Isolate *isolate = args.GetIsolate();
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
                                    Exception::TypeError(String::NewFromUtf8(isolate, "typed data array expected").ToLocalChecked()));
                            return nullptr;
                        }
                    case 0:
                        return new SymmetricKey();
                    default:
                        break;
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
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

static void digestImpl_update(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1 && ac.args[0]->IsTypedArray()) {
            auto digest = unwrap<Digest>(ac.args.This());
            auto c = ac.as<TypedArray>(0)->Buffer()->GetContents();
            auto data = c.Data();
            auto size = c.ByteLength();
            digest->update(data, size);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void digestImpl_doFinal(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto digest = unwrap<Digest>(ac.args.This());
            digest->doFinal();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void digestImpl_getDigest(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto digest = unwrap<Digest>(ac.args.This());
            ac.setReturnValue(ac.toBinary(digest->getDigest()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void digestImpl_getDigestSize(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto digest = unwrap<Digest>(ac.args.This());
            ac.setReturnValue((int)digest->getDigestSize());
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initDigestImpl(Scripter& scripter, Isolate *isolate) {
    Local<FunctionTemplate>
            tpl = bindCppClass<Digest>(
            isolate,
            "DigestImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> Digest * {
                Isolate *isolate = args.GetIsolate();
                if (args.Length() == 1) {
                    auto context = args.GetIsolate()->GetCurrentContext();
                    return new Digest((HashType)args[0]->Int32Value(context).FromJust());
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "bad constructor arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "update", FunctionTemplate::New(isolate, digestImpl_update));
    prototype->Set(isolate, "doFinal", FunctionTemplate::New(isolate, digestImpl_doFinal));
    prototype->Set(isolate, "getDigest", FunctionTemplate::New(isolate, digestImpl_getDigest));
    prototype->Set(isolate, "getDigestSize", FunctionTemplate::New(isolate, digestImpl_getDigestSize));
    return tpl;
}

static void generateSecurePseudoRandomBytes(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            int len = ac.asInt(0);
            if (len < 0 || len > 1024*1024) {
                ac.throwError("illegal length in argument");
            } else {
                ac.setReturnValue(ac.toBinary(crypto::generateSecurePseudoRandomBytes(len)));
                return;
            }
        } else {
            ac.throwError("one argument required");
        }
    });
}

static void calcHmac(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            int hashType = ac.asInt(0);
            auto keyBinary = ac.args[1].As<TypedArray>()->Buffer()->GetContents();
            auto dataBinary = ac.args[2].As<TypedArray>()->Buffer()->GetContents();

            int hashIndex = crypto::getHashIndex((crypto::HashType)hashType);
            byte_vector res;
            size_t resSize = MAXBLOCKSIZE;
            res.resize(resSize);
            hmac_memory(hashIndex, (unsigned char*)keyBinary.Data(), keyBinary.ByteLength(), (unsigned char*)dataBinary.Data(), dataBinary.ByteLength(), &res[0], &resSize);
            res.resize(resSize);
            ac.setReturnValue(ac.toBinary(res));
            return;
        } else {
            ac.throwError("three arguments required");
        }
    });
}

static void pbkdf2(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 5) {
            int hashType = ac.asInt(0);
            int rounds = ac.asInt(1);
            int keyLength = ac.asInt(2);
            auto password = ac.asString(3);
            auto saltBinary = ac.args[4].As<TypedArray>()->Buffer()->GetContents();

            byte_vector bvSalt(saltBinary.ByteLength());
            memcpy(&bvSalt[0], saltBinary.Data(), saltBinary.ByteLength());
            auto res = crypto::PBKDF2::derive((crypto::HashType)hashType, password, bvSalt, rounds, keyLength);

            ac.setReturnValue(ac.toBinary(res));
            return;
        } else {
            ac.throwError("5 arguments required");
        }
    });
}

static void JsVerifyExtendedSignature(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 4) {
            auto pubKey = unwrap<PublicKey>(Local<Object>::Cast(ac.args[0]));
            auto sig = ac.asBuffer(1);
            auto data = ac.asBuffer(2);
            auto onComplete = ac.asFunction(3);
            auto se = ac.scripter;
            runAsync([pubKey,sig,data,onComplete,se](){
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
                        onComplete->lockedContext([isAllOk, es, onComplete, se](Local<Context> cxt) {
                            if (isAllOk) {
                                onComplete->invoke(es.serializeToV8(cxt, onComplete->scripter_sp()));
                            } else {
                                onComplete->invoke(UObject().serializeToV8(cxt, onComplete->scripter_sp()));
                            }
                        });
                    }
                } catch (const std::exception& e) {
                    cerr << "JsVerifyExtendedSignature error: " << e.what() << endl;
                    onComplete->lockedContext([onComplete, se](Local<Context> cxt) {
                        onComplete->invoke(UObject().serializeToV8(cxt, onComplete->scripter_sp()));
                    });
                }
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitCrypto(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();

    auto crypto = ObjectTemplate::New(isolate);

    // order is critical!
    crypto->Set(isolate, "PrivateKeyImpl", initPrivateKey(scripter, isolate));
    crypto->Set(isolate, "PublicKeyImpl", initPublicKey(scripter, isolate));
    crypto->Set(isolate, "KeyAddress", initKeyAddress(scripter, isolate));
    crypto->Set(isolate, "SymmetricKeyImpl", initSymmetricKey(isolate));
    // endo of critical order
    crypto->Set(isolate, "version", String::NewFromUtf8(isolate, "0.0.1").ToLocalChecked());
    crypto->Set(isolate, "HashIdImpl", initHashId(scripter, isolate));
    crypto->Set(isolate, "__digest", FunctionTemplate::New(isolate, digest));
    crypto->Set(isolate, "DigestImpl", initDigestImpl(scripter, isolate));
    crypto->Set(isolate, "__generateSecurePseudoRandomBytes", FunctionTemplate::New(isolate, generateSecurePseudoRandomBytes));
    crypto->Set(isolate, "__calcHmac", FunctionTemplate::New(isolate, calcHmac));
    crypto->Set(isolate, "__pbkdf2", FunctionTemplate::New(isolate, pbkdf2));

    global->Set(isolate, "crypto", crypto);

    global->Set(isolate, "atob", FunctionTemplate::New(isolate, JsA2B));
    global->Set(isolate, "btoa", FunctionTemplate::New(isolate, JsB2A));

    global->Set(isolate, "__verify_extendedSignature", FunctionTemplate::New(isolate, JsVerifyExtendedSignature));
}

v8::Local<v8::Value> wrapHashId(shared_ptr<Scripter> scripter, crypto::HashId* hashId) {
    return wrap(scripter->hashIdTpl, scripter->isolate(), hashId, true);
}

v8::Local<v8::Value> wrapKeyAddress(shared_ptr<Scripter> scripter, crypto::KeyAddress* keyAddress) {
    return wrap(scripter->keyAddressTpl, scripter->isolate(), keyAddress, true);
}

v8::Local<v8::Value> wrapPublicKey(shared_ptr<Scripter> scripter, crypto::PublicKey* publicKey) {
    return wrap(scripter->publicKeyTpl, scripter->isolate(), publicKey, true);
}

v8::Local<v8::Value> wrapPrivateKey(shared_ptr<Scripter> scripter, crypto::PrivateKey* privateKey) {
    return wrap(scripter->privateKeyTpl, scripter->isolate(), privateKey, true);
}
