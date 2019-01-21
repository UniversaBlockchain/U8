//
// Created by Sergey Chernov on 2019-01-21.
//

#ifndef U8_WEAK_FINALIZERS_H
#define U8_WEAK_FINALIZERS_H

#include <v8.h>
#include <iostream>

using namespace v8;
using namespace std;

template<typename O, typename T>
struct SimpleFinalizerParameter;

template<typename O, typename T>
void SimpleFinalizerCallback(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data);

/**
 * Install automatic weak callback to free (delete) provided resource on V8 GC using SetWeak on
 * automatically created and handled Global<>. Just call it once after wrapping your data
 * into some V8 object and it well clean it as need.
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
};

/**
 * Weak callback for SimpleFinalizer template function. Not for direct use.
 */
template<typename O, typename T>
void SimpleFinalizerCallback(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data) {
    cout << "deactructing " << data.GetParameter()->data << endl;
    delete data.GetParameter()->data;
    // handle resets by destructor
    //    data.GetParameter()->handle.Reset();
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
    auto name = String::NewFromUtf8(isolate, class_name);
    Local<FunctionTemplate> tpl =
            FunctionTemplate::New(
                    isolate,
                    fnptr<void(const FunctionCallbackInfo<Value> &)>(
                            [=](auto args) {
                                if (!args.IsConstructCall()) {
                                    isolate->ThrowException(
                                            Exception::TypeError(String::NewFromUtf8(isolate,
                                                                                     "calling constructor as function")));
                                } else {
                                    T *cppObject = constructor(args);
                                    cout << "constructed " << cppObject << endl;
                                    Local<Object> result = args.This();
                                    result->SetInternalField(0, External::New(isolate, cppObject));
                                    SimpleFinalizer(result, cppObject);
                                    args.GetReturnValue().Set(args.This());
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


#endif //U8_WEAK_FINALIZERS_H
