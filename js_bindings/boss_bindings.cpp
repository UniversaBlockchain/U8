/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "boss_bindings.h"
#include "../serialization/BossSerializer.h"
#include "../types/TypesFactory.h"
#include "../types/UArray.h"

void JsBossAsyncDump(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {

            UObject obj = v8ValueToUObject(ac.isolate, ac.args[0]);
            auto onReady = ac.asFunction(1);

            runAsync([=]() {
                byte_vector res(BossSerializer::serialize(obj).get());
                onReady->lockedContext([=](Local<Context> &cxt) {
                    auto ab = ArrayBuffer::New(cxt->GetIsolate(), res.size());
                    memcpy(ab->GetContents().Data(), &res[0], res.size());
                    onReady->invoke(Uint8Array::New(ab, 0, res.size()));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void doNestedLoad(UObject& obj, const UObject& nestedLoadMap) {
    if (UBinder::isInstance(obj) && UBinder::isInstance(nestedLoadMap)) {
        UBinder& binderObj = UBinder::asInstance(obj);
        const UBinder& binderMap = UBinder::asInstance(nestedLoadMap);
        for (auto it = binderMap.begin(), itEnd = binderMap.end(); it != itEnd; ++it) {
            if (binderObj.find(it->first) != binderObj.end()) {
                UObject& obin = binderObj.get(it->first);
                if (UBytes::isInstance(obin)) {
                    UBytes& bin = UBytes::asInstance(obin);
                    UObject o = BossSerializer::deserialize(bin);
                    if (!it->second.isNull())
                        doNestedLoad(o, it->second);
                    UArray res({o, bin});
                    binderObj.set(it->first, res);
                } else if (UArray::isInstance(obin)) {
                    UArray& uArr = UArray::asInstance(obin);
                    for (size_t i = 0; i < uArr.size(); ++i) {
                        UObject& oo = uArr[i];
                        if (UBytes::isInstance(oo)) {
                            UBytes& bin = UBytes::asInstance(oo);
                            UObject o = BossSerializer::deserialize(bin);
                            if (!it->second.isNull())
                                doNestedLoad(o, it->second);
                            uArr[i] = UArray({o, bin});
                        }
                    }
                }
            }
        }
    }
}

void JsBossAsyncLoad(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 3) {
            auto buffer = ac.asBuffer(0);
            UObject nestedLoadMap;
            if (!ac.args[1]->IsNull())
                nestedLoadMap = v8ValueToUObject(ac.isolate, ac.args[1]);
            auto onReady = ac.asFunction(2);
            auto se = ac.scripter;
            runAsync([=]() {
                byte_vector bin(buffer->size());
                memcpy(&bin[0], buffer->data(), buffer->size());
                UObject obj = BossSerializer::deserialize(UBytes(move(bin)));

                if (!nestedLoadMap.isNull() && UBinder::isInstance(obj) && UBinder::isInstance(nestedLoadMap)) {
                    UBinder &bnd = UBinder::asInstance(obj);
                    UObject nlm = UBinder::asInstance(nestedLoadMap).get(bnd.getStringOrDefault("__type", ""));

                    if (!nlm.isNull())
                        doNestedLoad(obj, nlm);

//                    if (bnd.getStringOrDefault("__type", "") == string("TransactionPack")) {
//                        UBinder nlm = UBinder::of(
//                                "referencedItems", UBinder::of("data", UObject()),
//                                "subItems", UBinder::of("data", UObject()),
//                                "contract", UBinder::of("data", UObject())
//                        );
//                        doNestedLoad(obj, nlm);
//                    }
                }

                onReady->lockedContext([=](Local<Context> &cxt) {
                    onReady->invoke(obj.serializeToV8(cxt, se));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

shared_ptr<Persistent<Object>> getHashIdPrototype(shared_ptr<Scripter> scripter) {
    return scripter->getPrototype("HashId");
}

shared_ptr<Persistent<Object>> getPublicKeyPrototype(shared_ptr<Scripter> scripter) {
    return scripter->getPrototype("PublicKey");
}

shared_ptr<Persistent<Object>> getPrivateKeyPrototype(shared_ptr<Scripter> scripter) {
    return scripter->getPrototype("PrivateKey");
}

void JsBossAddPrototype(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto se = ac.scripter;
            if (!se->isPrototypesHolderFreezedForJs()) {
                string prototypeName = ac.asString(0);
                Local<Object> obj = ac.args[1]->ToObject(ac.isolate->GetCurrentContext()).ToLocalChecked();
                auto prototype = make_shared<Persistent<Object>>(ac.isolate, obj);
                if (prototypeName == "HashId")
                    se->setPrototype("HashId", prototype);
                else if (prototypeName == "PublicKey")
                    se->setPrototype("PublicKey", prototype);
                else if (prototypeName == "PrivateKey")
                    se->setPrototype("PrivateKey", prototype);
            }
            return;
        } else if (ac.args.Length() == 0) {
            auto se = ac.scripter;
            se->freezePrototypesHolderForJs();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static void USerializationErrorImpl_getStrValue(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto obj = unwrap<USerializationErrorImpl>(ac.args.This());
            ac.setReturnValue(ac.v8String(obj->getStrValue()));
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initUSerializationError(Scripter& scripter) {
    Isolate *isolate = scripter.isolate();
    Local<FunctionTemplate> tpl = bindCppClass<USerializationErrorImpl>(
            isolate,
            "USerializationErrorImpl",
            [=](const FunctionCallbackInfo<Value> &args) -> USerializationErrorImpl* {
                Isolate *isolate = args.GetIsolate();
                if (args.Length() == 1) {
                    try {
                        v8::String::Utf8Value str(isolate, args[0]->ToString(isolate->GetCurrentContext()).ToLocalChecked());
                        auto res = new USerializationErrorImpl(*str);
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what()).ToLocalChecked()));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments").ToLocalChecked()));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__getStrValue", FunctionTemplate::New(isolate, USerializationErrorImpl_getStrValue));

    scripter.USerializationErrorTpl.Reset(isolate, tpl);
    return tpl;
}

v8::Local<v8::Value> wrapUSerializationError(shared_ptr<Scripter> scripter, USerializationErrorImpl* obj) {
    return wrap(scripter->USerializationErrorTpl, scripter->isolate(), obj, true);
}

void JsInitBossBindings(Scripter& scripter, const Local<ObjectTemplate> &global) {
    Isolate *isolate = scripter.isolate();
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncDump").ToLocalChecked(), FunctionTemplate::New(isolate, JsBossAsyncDump));
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncLoad").ToLocalChecked(), FunctionTemplate::New(isolate, JsBossAsyncLoad));
    global->Set(String::NewFromUtf8(isolate, "__boss_addPrototype").ToLocalChecked(), FunctionTemplate::New(isolate, JsBossAddPrototype));

    global->Set(isolate, "USerializationErrorImpl", initUSerializationError(scripter));
}
