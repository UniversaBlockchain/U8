/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UBYTES_H
#define UNITOOLS_UBYTES_H

#include <memory>
#include <vector>
#include <cstring>
#include "UObject.h"

class UBytes : public UObject {
private:
    class UBytesData : public UData {
    public:
        UBytesData(const unsigned char *v, unsigned int size);
        UBytesData();
        ~UBytesData() override = default;

        Local<Object> serializeToV8(Isolate *isolate) override {
            auto ab = ArrayBuffer::New(isolate, value.size());
            memcpy(ab->GetContents().Data(), &value[0], value.size());
            return Uint8Array::New(ab, 0, value.size());
        };

        void dbgPrint(std::string prefix) override {
            printf("Bytes, len=%zu\n", value.size());
        }

        std::vector<unsigned char> value;
    };

public:
    static bool isInstance(const UObject& object);

    static UBytes& asInstance(UObject& object);

    static const UBytes& asInstance(const UObject& object);


    UBytes(std::vector<unsigned char>&& val);
    UBytes(const unsigned  char* value, unsigned int size);
    const std::vector<unsigned char>& get() const;
};


#endif //UNITOOLS_UOBJECT_H
