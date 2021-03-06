/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UINT_H
#define UNITOOLS_UINT_H

#include <string>
#include <memory>
#include "UObject.h"

class UInt : public UObject {
private:
    class UIntData : public UData {
    public:
        UIntData(int64_t v);
        ~UIntData() override = default;

        Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) override {
            return Local<Object>::Cast(Number::New(scripter->isolate(), value));
        }

        void dbgPrint(std::string prefix) override {
            cout << value << endl;
        }

        int64_t value;
    };

public:
    static bool isInstance(const UObject& object);

    static UInt& asInstance(UObject& object);

    static const UInt& asInstance(const UObject& object);



    UInt(int64_t value);

    int64_t get() const;
};


#endif //UNITOOLS_UOBJECT_H
