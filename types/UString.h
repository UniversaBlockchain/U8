/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_USTRING_H
#define UNITOOLS_USTRING_H

#include <memory>
#include <string>
#include "UObject.h"

class UString : public UObject {
private:
    class UStringData : public UData {
    public:
        UStringData(const std::string &v);
        ~UStringData() override = default;

        Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) override {
            auto res = Local<Object>::Cast(String::NewFromUtf8(scripter->isolate(), value.data()).ToLocalChecked());
            return res;
        };

        void dbgPrint(std::string prefix) override {
            printf("\"%s\"\n", value.data());
        }

        std::string value;
    };

public:
    static bool isInstance(const UObject& object);

    static UString& asInstance(UObject& object);

    static const UString& asInstance(const UObject& object);



    UString(const std::string& value);

    const std::string& get() const;
};


#endif //UNITOOLS_UOBJECT_H
