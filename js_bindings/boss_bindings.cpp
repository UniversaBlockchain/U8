//
// Created by flint on 8/5/19.
//

#include "boss_bindings.h"
#include "../universa_core/ISerializableV8.h"
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
            //cout << it->first << endl;
            if (binderObj.find(it->first) != binderObj.end()) {
                UObject& obin = binderObj.get(it->first);
                if (UBytes::isInstance(obin)) {
                    UBytes& bin = UBytes::asInstance(obin);
                    UObject o = BossSerializer::deserialize(bin);
                    if (!it->second.isNull())
                        doNestedLoad(o, it->second);
                    //binderObj.set(it->first+"_bin", bin);
                    binderObj.set(it->first, o);
                } else if (UArray::isInstance(obin)) {
                    //binderObj.set(it->first+"_bin", UArray::asInstance(obin));
                    UArray& uArr = UArray::asInstance(obin);
                    for (size_t i = 0; i < uArr.size(); ++i) {
                        UObject& oo = uArr[i];
                        if (UBytes::isInstance(oo)) {
                            UBytes& bin = UBytes::asInstance(oo);
                            UObject o = BossSerializer::deserialize(bin);
                            if (!it->second.isNull())
                                doNestedLoad(o, it->second);
                            uArr[i] = o;
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
//                long t0 = getCurrentTimeMillis();
                UObject obj = BossSerializer::deserialize(UBytes(move(bin)));
                doNestedLoad(obj, nestedLoadMap);
//                long dt = getCurrentTimeMillis() - t0;
//                cout << "cpp dt = " << dt << endl;
                onReady->lockedContext([=](Local<Context> &cxt) {
                    onReady->invoke(obj.serializeToV8(onReady->isolate()));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

void JsInitBossBindings(Isolate *isolate, const Local<ObjectTemplate> &global) {
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncDump"), FunctionTemplate::New(isolate, JsBossAsyncDump));
    global->Set(String::NewFromUtf8(isolate, "__boss_asyncLoad"), FunctionTemplate::New(isolate, JsBossAsyncLoad));
}
