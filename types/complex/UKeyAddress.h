/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_UKEYADDRESS_H
#define U8_UKEYADDRESS_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/KeyAddress.h"
#include "../../js_bindings/crypto_bindings.h"

class UKeyAddress: public UObject {
private:
    class UKeyAddressData : public UData {
    public:
        UKeyAddressData();
        UKeyAddressData(const crypto::KeyAddress &val);
        ~UKeyAddressData() = default;

        Local<Object> serializeToV8(Scripter& scripter, Isolate* isolate) override {
            auto res = wrapKeyAddress(scripter, isolate, new crypto::KeyAddress(*keyAddress.get()));
            return Local<Object>::Cast(res);
        }

        void dbgPrint(std::string prefix) override {
            printf("KeyAddress=%s\n", keyAddress->toString().data());
        }

        std::shared_ptr<crypto::KeyAddress> keyAddress;
    };

public:
    UKeyAddress();
    UKeyAddress(const crypto::KeyAddress &val);

    static bool isInstance(const UObject& object);
    static UKeyAddress& asInstance(UObject& object);
    static const UKeyAddress& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    crypto::KeyAddress& getKeyAddress();
};

#endif //U8_UKEYADDRESS_H
