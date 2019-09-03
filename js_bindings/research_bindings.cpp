/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "research_bindings.h"
#include "../tools/StressTestTools.h"
#include <cmath>
#include <vector>
#include <deque>
#include <forward_list>

static Persistent<FunctionTemplate> MemoryUser1Tpl;
static Persistent<FunctionTemplate> MemoryUser2Tpl;
static Persistent<FunctionTemplate> MemoryUser3Tpl;

template <class T, int minSize, int maxSize>
class MemoryUser {
public:
//    ~MemoryUser() {cout << "~MemoryUser()" << endl;}
    void fill(int minBytesToUse) {
        size_t curSize = 0;
        while (curSize < minBytesToUse) {
            byte_vector payload = QueueGrinder::genPayload(rg_, minSize, maxSize);
            curSize += payload.size();
            memBuf_.emplace_back(std::move(payload));
        }
    }
    void clear() {
        memBuf_.clear();
        T().swap(memBuf_);
    }
    bool check() {
        bool res = true;
        for (auto it = memBuf_.begin(), itEnd = memBuf_.end(); it != itEnd; ++it) {
            res = QueueGrinder::isPayloadValid(*it);
            if (!res)
                break;
        }
        return res;
    }
private:
    T memBuf_;
    RandomByteVectorGenerator rg_;
};

class MemoryUser1: public MemoryUser<vector<byte_vector>, 270, 24*1024> {
public:
//    ~MemoryUser1() {cout << "~MemoryUser1()" << endl;}
};

class MemoryUser2: public MemoryUser<deque<byte_vector>, 50, 5000> {
public:
//    ~MemoryUser2() {cout << "~MemoryUser2()" << endl;}
};

class MemoryUser3: public MemoryUser<list<byte_vector>, 40, 60> {
public:
//    ~MemoryUser3() {cout << "~MemoryUser3()" << endl;}
};

template<class T>
void memoryUser_fill(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto memoryUser = unwrap<T>(ac.args.This());
            int minBytesToUse = ac.asInt(0);
            memoryUser->fill(minBytesToUse);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

template<class T>
static void memoryUser_fillAsync(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 2) {
            auto memoryUser = unwrap<T>(ac.args.This());
            auto minBytesToUse = ac.asInt(0);
            auto onReady = ac.asFunction(1);
            auto scripter = ac.scripter;
            runAsync([=]() {
                memoryUser->fill(minBytesToUse);
                bool noResult = true;
                scripter->lockedContext([=](auto& cxt) {
                    onReady->invoke(Boolean::New(cxt->GetIsolate(), noResult));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

template<class T>
void memoryUser_clear(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto memoryUser = unwrap<T>(ac.args.This());
            memoryUser->clear();
            return;
        }
        ac.throwError("invalid arguments");
    });
}

template<class T>
void memoryUser_check(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 0) {
            auto memoryUser = unwrap<T>(ac.args.This());
            bool res = memoryUser->check();
            ac.setReturnValue(res);
            return;
        }
        ac.throwError("invalid arguments");
    });
}

template<class T>
static void memoryUser_checkAsync(const FunctionCallbackInfo<Value> &args) {
    Scripter::unwrapArgs(args, [](ArgsContext &ac) {
        if (ac.args.Length() == 1) {
            auto memoryUser = unwrap<T>(ac.args.This());
            auto onReady = ac.asFunction(0);
            auto scripter = ac.scripter;
            runAsync([=]() {
                bool res = memoryUser->check();
                scripter->lockedContext([=](auto& cxt) {
                    onReady->invoke(Boolean::New(cxt->GetIsolate(), res));
                });
            });
            return;
        }
        ac.throwError("invalid arguments");
    });
}

Local<FunctionTemplate> initMemoryUser1(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<MemoryUser1>(
            isolate,
            "MemoryUser1Tpl",
            [=](const FunctionCallbackInfo<Value> &args) -> MemoryUser1* {
                if (args.Length() == 0) {
                    try {
                        auto res = new MemoryUser1();
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what())));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__fill", FunctionTemplate::New(isolate, memoryUser_fill<MemoryUser1>));
    prototype->Set(isolate, "__fillAsync", FunctionTemplate::New(isolate, memoryUser_fillAsync<MemoryUser1>));
    prototype->Set(isolate, "__clear", FunctionTemplate::New(isolate, memoryUser_clear<MemoryUser1>));
    prototype->Set(isolate, "__check", FunctionTemplate::New(isolate, memoryUser_check<MemoryUser1>));
    prototype->Set(isolate, "__checkAsync", FunctionTemplate::New(isolate, memoryUser_checkAsync<MemoryUser1>));

    MemoryUser1Tpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initMemoryUser2(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<MemoryUser2>(
            isolate,
            "MemoryUser2Tpl",
            [=](const FunctionCallbackInfo<Value> &args) -> MemoryUser2* {
                if (args.Length() == 0) {
                    try {
                        auto res = new MemoryUser2();
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what())));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__fill", FunctionTemplate::New(isolate, memoryUser_fill<MemoryUser2>));
    prototype->Set(isolate, "__fillAsync", FunctionTemplate::New(isolate, memoryUser_fillAsync<MemoryUser2>));
    prototype->Set(isolate, "__clear", FunctionTemplate::New(isolate, memoryUser_clear<MemoryUser2>));
    prototype->Set(isolate, "__check", FunctionTemplate::New(isolate, memoryUser_check<MemoryUser2>));
    prototype->Set(isolate, "__checkAsync", FunctionTemplate::New(isolate, memoryUser_checkAsync<MemoryUser2>));

    MemoryUser2Tpl.Reset(isolate, tpl);
    return tpl;
}

Local<FunctionTemplate> initMemoryUser3(Isolate *isolate) {
    Local<FunctionTemplate> tpl = bindCppClass<MemoryUser3>(
            isolate,
            "MemoryUser3Tpl",
            [=](const FunctionCallbackInfo<Value> &args) -> MemoryUser3* {
                if (args.Length() == 0) {
                    try {
                        auto res = new MemoryUser3();
                        return res;
                    } catch (const std::exception& e) {
                        isolate->ThrowException(
                                Exception::TypeError(String::NewFromUtf8(isolate, e.what())));
                        return nullptr;
                    }
                }
                isolate->ThrowException(
                        Exception::TypeError(String::NewFromUtf8(isolate, "invalid number of arguments")));
                return nullptr;
            });
    auto prototype = tpl->PrototypeTemplate();
    prototype->Set(isolate, "__fill", FunctionTemplate::New(isolate, memoryUser_fill<MemoryUser3>));
    prototype->Set(isolate, "__fillAsync", FunctionTemplate::New(isolate, memoryUser_fillAsync<MemoryUser3>));
    prototype->Set(isolate, "__clear", FunctionTemplate::New(isolate, memoryUser_clear<MemoryUser3>));
    prototype->Set(isolate, "__check", FunctionTemplate::New(isolate, memoryUser_check<MemoryUser3>));
    prototype->Set(isolate, "__checkAsync", FunctionTemplate::New(isolate, memoryUser_checkAsync<MemoryUser3>));

    MemoryUser3Tpl.Reset(isolate, tpl);
    return tpl;
}

void JsInitResearchBindings(Isolate *isolate, const Local<ObjectTemplate> &global) {

    auto research = ObjectTemplate::New(isolate);

    research->Set(isolate, "MemoryUser1Impl", initMemoryUser1(isolate));
    research->Set(isolate, "MemoryUser2Impl", initMemoryUser2(isolate));
    research->Set(isolate, "MemoryUser3Impl", initMemoryUser3(isolate));

    global->Set(isolate, "research", research);
}
