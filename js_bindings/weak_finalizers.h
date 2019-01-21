//
// Created by Sergey Chernov on 2019-01-21.
//

#ifndef U8_WEAK_FINALIZERS_H
#define U8_WEAK_FINALIZERS_H

#include <v8.h>
#include <iostream>

using namespace v8;
using namespace std;

template <typename O,typename T>
struct SimpleFinalizerParameter;

template <typename O,typename T>
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
template <typename V8Object,typename T>
void SimpleFinalizer(const Local<V8Object> &object, T *simpleData) {
    new SimpleFinalizerParameter(object, simpleData);
}

/**
 * Parameter holder for SimpleFinalizer template function. Not for direct use.
 */
template <typename O,typename T>
class SimpleFinalizerParameter {
private:
    SimpleFinalizerParameter(const Local<O> &object, T *simpleData) : data(simpleData) {
        handle.Reset(object->GetIsolate(), object);
        handle.SetWeak(this, SimpleFinalizerCallback<O,T>, WeakCallbackType::kParameter);
    }

    Global<O> handle;
    T *data;

    friend void SimpleFinalizer<O,T>(const Local<O> &object, T *simpleData);
    friend void SimpleFinalizerCallback<O,T>(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data);
};

/**
 * Weak callback for SimpleFinalizer template function. Not for direct use.
 */
template <typename O,typename T>
void SimpleFinalizerCallback(const WeakCallbackInfo<SimpleFinalizerParameter<O, T>> &data) {
    cout << "FINALIZER" << data.GetParameter()->data << endl;
    delete data.GetParameter()->data;
    data.GetParameter()->handle.Reset();
    delete data.GetParameter();
}


#endif //U8_WEAK_FINALIZERS_H
