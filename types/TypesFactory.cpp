//
// Created by flint on 8/7/19.
//

#include "TypesFactory.h"
#include "UArray.h"
#include "UString.h"
#include "UBinder.h"
#include <unordered_map>
#include <functional>

static std::unordered_map<std::string, std::function<UObject(Isolate* isolate, Local<Object> obj)>> v8ObjectToUObjectFactory {
    {"Array", [](Isolate* isolate, Local<Object> obj){
        if (obj->IsArray()) {
            UArray res;
            int length = obj->Get(String::NewFromUtf8(isolate, "length"))->Int32Value(isolate->GetCurrentContext()).FromJust();
            for (int i = 0; i < length; ++i) {
                Local<Value> item = obj->Get(i);
                res.push_back(v8ValueToUObject(isolate, item));
            }
            return res;
        }
        fprintf(stderr, "Boss TypesFactory error: unable to process object 'Array'\n");
        return UArray();
    }},
    {"Object", [](Isolate* isolate, Local<Object> obj){
        UBinder res;
        Local<Array> keysArr = obj->GetOwnPropertyNames(isolate->GetCurrentContext()).ToLocalChecked();
        auto length = keysArr->Length();
        for (auto i = 0; i < length; ++i) {
            Local<Value> key = keysArr->Get(i);
            if (key->IsString()) {
                Local<String> skey = key->ToString(isolate);
                Local<Value> val = obj->Get(skey);
                auto str = String::Utf8Value(isolate, key);
                std::string s(*str);
                res.set(s, v8ValueToUObject(isolate, val));
            }
        }
        return res;
    }},
};

static std::unordered_map<std::string, std::function<UObject(Isolate* isolate, Local<Value> v8value)>> v8ValueToUObjectFactory {
        {"string", [](Isolate* isolate, Local<Value> v8value){
            if (v8value->IsString()) {
                auto str = String::Utf8Value(isolate, v8value);
                std::string s(*str);
                UString res(s);
                return res;
            }
            fprintf(stderr, "Boss TypesFactory error: unable to process value 'string'\n");
            return UString("");
        }},
        {"object", [](Isolate* isolate, Local<Value> v8value){
            if (v8value->IsNull()) {
                return UObject();
            }
            fprintf(stderr, "Boss TypesFactory error: unable to process value 'object'\n");
            return UObject();
        }},
};

UObject v8ValueToUObject(v8::Isolate* isolate, v8::Local<Value> v8value) {
    if (v8value->IsObject()) {
        Local<Object> obj = v8value->ToObject(isolate);
        auto constructorNameStr = String::Utf8Value(isolate, obj->GetConstructorName());
        std::string constructorName(*constructorNameStr);
        if (v8ObjectToUObjectFactory.find(constructorName) != v8ObjectToUObjectFactory.end()) {
            return v8ObjectToUObjectFactory[constructorName](isolate, obj);
        } else {
            fprintf(stderr, "Boss TypesFactory error: unknown Object prototype '%s'\n", constructorName.data());
            return UObject();
        }
    } else {
        auto objTypeStr = String::Utf8Value(isolate, v8value->TypeOf(isolate));
        std::string objType(*objTypeStr);
        if (v8ValueToUObjectFactory.find(objType) != v8ValueToUObjectFactory.end())
            return v8ValueToUObjectFactory[objType](isolate, v8value);
        else {
            fprintf(stderr, "Boss TypesFactory error: unknown Value type '%s'\n", objType.data());
            return UObject();
        }
    }
}
