/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UOBJECT_H
#define UNITOOLS_UOBJECT_H

#include <string>
#include <memory>
#include <v8.h>
#include "../js_bindings/Scripter.h"

using namespace v8;


template<typename A, typename B> inline bool isInstanceOf(B *ptr) {
    return dynamic_cast<A*>(ptr) != nullptr;
}

template<typename A, typename B> inline bool isInstanceOf(const B *ptr) {
    return dynamic_cast<const A*>(ptr) != nullptr;
}


class UData {

public:
    bool isEmpty() const {
        return empty;
    }

    virtual ~UData() {

    }

    UData() = default;

    UData(bool empty) {
        this->empty = empty;
    }

    virtual Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) {
        return Local<Object>::Cast(Null(scripter->isolate()));
    };

    virtual void dbgPrint(std::string prefix) {
        printf("null\n");
    }

private:
    bool empty = false;
};

class UObject {

private:
    std::shared_ptr<UData> ptr;

protected:

    UObject(const std::shared_ptr<UData>& p) : ptr(p) {

    };

    template <typename  T> const T& data() const {
        return *static_cast<T*>(ptr.get());
    }

    template <typename  T> T& data() {
        return *static_cast<T*>(ptr.get());
    }

public:
    template <typename T> bool dataIsInstanceOf() const {
        return isInstanceOf<T>(ptr.get());
    }


    bool isNull() const {
        return data<UData>().isEmpty();
    }

    UObject() : ptr(std::make_shared<UData>(true)) {

    };

    Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) const {
        return ptr.get()->serializeToV8(cxt, scripter);
    }

    void dbgPrint(std::string prefix = "") const {
        ptr.get()->dbgPrint(prefix);
    }

};

extern UObject nullObject;

#endif //UNITOOLS_UOBJECT_H
