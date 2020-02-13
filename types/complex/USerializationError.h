/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_USERIALIZATIONERROR_H
#define U8_USERIALIZATIONERROR_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../UString.h"

class USerializationError: public UObject {
private:
    class USerializationErrorData : public UData {
    public:
        USerializationErrorData();
        USerializationErrorData(const std::string &val);
        ~USerializationErrorData() override = default;

        Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) override {
            auto res = Local<Object>::Cast(String::NewFromUtf8(scripter->isolate(), strValue.data()).ToLocalChecked());
            return res;
        }

        void dbgPrint(std::string prefix) override {
            printf("USerializationError=%s\n", strValue.data());
        }

        std::string strValue;
    };

public:
    USerializationError();
    USerializationError(const std::string &val);

    static bool isInstance(const UObject& object);
    static USerializationError& asInstance(UObject& object);
    static const USerializationError& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    const std::string& getValue() const;
};

#endif //U8_USERIALIZATIONERROR_H
