/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UBOOL_H
#define UNITOOLS_UBOOL_H

#include <string>
#include <memory>
#include "UObject.h"

class UBool : public UObject {
private:
    class UBoolData : public UData {
    public:
        UBoolData(bool v);
        ~UBoolData() = default;

        Local<Object> serializeToV8(Isolate* isolate) override {
            return Local<Object>::Cast(Boolean::New(isolate, value));
        }

        void dbgPrint(std::string prefix) override {
            printf("%s\n", value?"true":"false");
        }

        bool value;
    };

public:
    static bool isInstance(const UObject& object);

    static UBool& asInstance(UObject& object);

    static const UBool& asInstance(const UObject& object);



    UBool(bool value);

    bool get() const;
};


#endif //UNITOOLS_UOBJECT_H
