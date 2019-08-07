//
// Created by flint on 8/5/19.
//

#include "boss_bindings.h"
#include "../universa_core/ISerializableV8.h"
#include "../serialization/BossSerializer.h"
#include "../types/TypesFactory.h"

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

void JsBossAsyncLoad(const v8::FunctionCallbackInfo<v8::Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto buffer = ac.asBuffer(0);
            auto onReady = ac.asFunction(1);
            runAsync([=]() {
                byte_vector bin(buffer->size());
                memcpy(&bin[0], buffer->data(), buffer->size());
                UObject obj = BossSerializer::deserialize(UBytes(move(bin)));
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
