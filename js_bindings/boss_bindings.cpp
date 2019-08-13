//
// Created by flint on 8/5/19.
//

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
            runAsync([=]() {
                byte_vector bin(buffer->size());
                memcpy(&bin[0], buffer->data(), buffer->size());
                UObject obj = BossSerializer::deserialize(UBytes(move(bin)));

                if (UBinder::isInstance(obj)) {
                    UBinder &bnd = UBinder::asInstance(obj);
                    if (bnd.getStringOrDefault("__type", "") == string("TransactionPack")) {
                        UBinder nlm = UBinder::of(
                                "referencedItems", UBinder::of("data", UObject()),
                                "subItems", UBinder::of("data", UObject()),
                                "contract", UBinder::of("data", UObject())
                        );
                        doNestedLoad(obj, nlm);
                    }
                }
//                doNestedLoad(obj, nestedLoadMap);

                onReady->lockedContext([=](Local<Context> &cxt) {
                    onReady->invoke(obj.serializeToV8(onReady->isolate()));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

static shared_ptr<Persistent<Object>> hashId_prototype;
static shared_ptr<Persistent<Object>> publicKey_prototype;
static shared_ptr<Persistent<Object>> privateKey_prototype;

shared_ptr<Persistent<Object>> getHashIdPrototype() {
    return hashId_prototype;
}

shared_ptr<Persistent<Object>> getPublicKeyPrototype() {
    return publicKey_prototype;
}

shared_ptr<Persistent<Object>> getPrivateKeyPrototype() {
    return privateKey_prototype;
}

void JsBossAddPrototype(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            string prototypeName = ac.asString(0);
            Local<Object> obj = ac.args[1]->ToObject(ac.isolate);
            auto prototype = make_shared<Persistent<Object>>(ac.isolate, obj);
            if (prototypeName == "HashId")
                hashId_prototype = prototype;
            else if (prototypeName == "PublicKey")
                publicKey_prototype = prototype;
            else if (prototypeName == "PrivateKey")
                privateKey_prototype = prototype;
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitBossBindings(Isolate *isolate, const Local<ObjectTemplate> &global) {
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncDump"), FunctionTemplate::New(isolate, JsBossAsyncDump));
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncLoad"), FunctionTemplate::New(isolate, JsBossAsyncLoad));
    global->Set(String::NewFromUtf8(isolate, "__boss_addPrototype"), FunctionTemplate::New(isolate, JsBossAddPrototype));
}
