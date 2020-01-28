/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_BINDING_TOOLS_H
#define U8_BINDING_TOOLS_H

#include <v8.h>
#include <iostream>
#include <optional>
#include "../tools/tools.h"
#include "../tools/ThreadPool.h"
#include "../tools/AutoThreadPool.h"
#include "Scripter.h"

using namespace v8;
using namespace std;

template<typename O, typename T>
struct SimpleFinalizerParameter;

template<typename O, typename T>
void SimpleFinalizerCallback(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data);

/**
 * Install automatic weak callback to free (delete) provided resource on V8 GC using SetWeak on
 * automatically created and handled Global<>. Just call it once after wrapping your data
 * into some V8 object and it will clean it as need.
 *
 * @tparam V8Object that holds simpleDate in as internal field (for example).
 * @tparam T type of the data to be deleted as V8 object get reclaimed
 * @param object that owns simpleData
 * @param simpleData data owned by the object
 */
template<typename V8Object, typename T>
void SimpleFinalizer(const Local<V8Object> &object, T *simpleData) {
    new SimpleFinalizerParameter(object, simpleData);
}

/**
 * Parameter holder for SimpleFinalizer template function. Not for direct use.
 */
template<typename O, typename T>
class SimpleFinalizerParameter {
private:
    SimpleFinalizerParameter(const Local<O> &object, T *simpleData) : data(simpleData) {
        handle.Reset(object->GetIsolate(), object);
        handle.SetWeak(this, SimpleFinalizerCallback<O, T>, WeakCallbackType::kParameter);
    }

    Global<O> handle;
    T *data;

    friend void SimpleFinalizer<O, T>(const Local<O> &object, T *simpleData);

    friend void SimpleFinalizerCallback<O, T>(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data);

    ~SimpleFinalizerParameter() {
        delete data;
        handle.Reset();
    }
};

/**
 * Weak callback for SimpleFinalizer template function. Not for direct use.
 */
template<typename O, typename T>
void SimpleFinalizerCallback(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data) {
    // handle resets by destructor so we just delete our parameter, C++ does the rest ;)
    delete data.GetParameter();
}

/**
 * Unwrap simple T* C++ bound object from V8 Object
 *
 * @tparam T type of the bound object
 * @param obj V8 object that binds C++ object
 * @param fieldNo inetrnal field index (usually 0) where it is stored.
 * @return unwrapped C++ object
 */
template<class T>
T *unwrap(const Local<Object> &obj, int fieldNo = 0) {
    Local<External> wrap = Local<External>::Cast(obj->GetInternalField(fieldNo));
    return static_cast<T *>(wrap->Value());
}


//---------------------------------------------------------------------------------------------------- HACK!
/*
 * This is a bloody hack intended to evade strange V8 template constructor limitation that does not
 * allow us to pass stateful (e.g. [=]) lambdas for constructor callback.
 *
 * We need them to be able to pass C++ instance constructing lambda by value (e.g. copy) at least, and,
 * moreover, to be able to have stateful constricting lambda what is generally good.
 *
 * Ignore all this until "end hack". And thanks https://stackoverflow.com/users/4832499/passer-by
 * for the elegant way to do it event in C++ ;)
 */

template<typename Callable>
union storage {
    storage() {}

    std::decay_t<Callable> callable;
};

template<int, typename Callable, typename Ret, typename... Args>
auto fnptr_(Callable &&c, Ret (*)(Args...)) {
    static bool used = false;
    static storage<Callable> s;
    using type = decltype(s.callable);

    if (used)
        s.callable.~type();
    new(&s.callable) type(std::forward<Callable>(c));
    used = true;

    return [](Args... args) -> Ret {
        return Ret(s.callable(std::forward<Args>(args)...));
    };
}

template<typename Fn, int N = 0, typename Callable>
Fn *fnptr(Callable &&c) {
    return fnptr_<N>(std::forward<Callable>(c), (Fn *) nullptr);
}

// -----------------------------------------------------------------------------------------------------  End HACK

/**
 * Bind the dynamically constructed C++ class (e.g. with new) object to the V8 Javascript class template.
 *
 * @tparam T C++ class type
 * @tparam F C++ constructing lambda, should accept (const FunctionCallbackInfo<Value> &)  arguments and return T*)
 * @param isolate ti create template in
 * @param class_name class name to report on JavascriptSide
 * @param constructor lambda that should consruct new T instance from (const FunctionCallbackInfo<Value> &)
 *
 * @return V8 Function template that represents bound Javascript class. Note that it is not registered in any context.
 */
template<typename T, typename F>
Local<FunctionTemplate> bindCppClass(Isolate *isolate, const char *class_name, F &&constructor) {
    auto name = String::NewFromUtf8(isolate, class_name).ToLocalChecked();
    Local<FunctionTemplate> tpl =
            FunctionTemplate::New(
                    isolate,
                    fnptr<void(const FunctionCallbackInfo<Value> &)>(
                            [constructor](auto args) {
                                Isolate* isolate = args.GetIsolate();
                                if (!args.IsConstructCall()) {
                                    isolate->ThrowException(
                                            Exception::TypeError(String::NewFromUtf8(isolate,
                                                                                     "calling constructor as function").ToLocalChecked()));
                                } else {
                                    try {
                                        T *cppObject = constructor(args);
                                        if (!cppObject) {
                                            args.GetReturnValue().SetUndefined();
                                        } else {
                                            Local<Object> result = args.This();
                                            if( result->InternalFieldCount() < 1)
                                            isolate->ThrowException(
                                                    Exception::TypeError(String::NewFromUtf8(isolate,
                                                                                             "bindCppClass: Bad tebplate: internal field count is 0").ToLocalChecked()));
                                            else {
                                                result->SetInternalField(0, External::New(isolate, cppObject));
                                                SimpleFinalizer(result, cppObject);
                                                args.GetReturnValue().Set(args.This());
                                            }
                                        }
                                    }
                                    catch(const exception& e) {
                                        string message = "unhandled C++ exception: "s + e.what();
                                        isolate->ThrowException(
                                                Exception::TypeError(String::NewFromUtf8(isolate,
                                                                                         message.data()).ToLocalChecked()));
                                    }
                                }
                            }));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);
    tpl->SetClassName(name);
    return tpl;
}

/**
 * Bind the dynamically constructed C++ class (e.g. with new T()) object to the V8 Javascript class template. The default
 * C++ constructor should present and be public.
 *
 * @tparam T C++ class type
 * @param isolate ti create template in
 * @param class_name class name to report on JavascriptSide
 *
 * @return V8 Function template that represents bound Javascript class. Note that it is not registered in any context.
 */
template<typename T>
Local<FunctionTemplate> bindCppClass(Isolate *isolate, const char *class_name) {
    return bindCppClass<T>(isolate, class_name, [](auto args) { return new T(); });
}

/**
 * Convert JS TypedArray to byte_vector.
 *
 * @param object should be some TypedArray as for now
 * @return converted vector or empty optional if conversion is not possible
 */
inline
optional<byte_vector> v8ToVector(Local<Value> object) {
    if (object->IsTypedArray()) {
        auto buffer = object.As<TypedArray>()->Buffer();
        unsigned char *data = (unsigned char *) buffer->GetContents().Data();
        byte_vector v;
        v.assign(data, data + buffer->ByteLength());
        return optional<byte_vector>(v);
    }
    return optional<byte_vector>();
}

inline Local<Uint8Array> vectorToV8(Isolate* isolate, const byte_vector& data) {
    auto buff = ArrayBuffer::New(isolate, data.size());
    memcpy(buff->GetContents().Data(), data.data(), data.size() );
    return Uint8Array::New(buff, 0, data.size());
}

/**
 * Wrap some C++ object into new instance of some object. Important! If the object template does not have
 * internal field space, the C++ object IS DELETED, JS  exception is thrown and UNDEFINED is returned.
 *
 * @tparam T
 * @param objectTemplate persistent link to the object template
 * @param isolate
 * @param cppObject pointer to object to wrap
 * @param setWeak true for applying SimpleFinalizer
 * @return wrapped object or undefined.
 */
template<typename T>
Local<Value> wrap(Persistent<FunctionTemplate>& objectTemplate, Isolate *isolate, T *cppObject, bool setWeak = false) {
    auto tpl = objectTemplate.Get(isolate);
    auto objMaybeLocal = tpl->InstanceTemplate()->NewInstance(isolate->GetCurrentContext());
    Local<Object> obj;
    if (objMaybeLocal.ToLocal(&obj)) {
        if (obj->InternalFieldCount() < 1) {
            isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "no internal field").ToLocalChecked()));
            delete cppObject;
            return Undefined(isolate);
        } else {
            obj->SetInternalField(0, External::New(isolate, cppObject));
            if (setWeak)
                SimpleFinalizer(obj, cppObject);
            return obj;
        }
    } else {
        isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "objMaybeLocal.ToLocal returns false").ToLocalChecked()));
        delete cppObject;
        return Undefined(isolate);
    }
}

#endif //U8_BINDING_TOOLS_H
