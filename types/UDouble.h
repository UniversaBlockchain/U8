/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UDOUBLE_H
#define UNITOOLS_UDOUBLE_H

#include <memory>
#include "UObject.h"

class UDouble : public UObject {
private:
    class UDoubleData : public UData {
    public:
        UDoubleData(double v);
        ~UDoubleData() override = default;

        Local<Object> serializeToV8(Isolate* isolate) override {
            return Local<Object>::Cast(Number::New(isolate, value));
        }

        void dbgPrint(std::string prefix) override {
            printf("%f\n", value);
        }

        double value;
    };

public:
    static bool isInstance(const UObject& object);

    static UDouble& asInstance(UObject& object);

    static const UDouble& asInstance(const UObject& object);



    UDouble(double value);

    double get() const;
};


#endif //UNITOOLS_UOBJECT_H
