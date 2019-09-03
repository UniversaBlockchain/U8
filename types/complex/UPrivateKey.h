/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_UPRIVATEKEY_H
#define U8_UPRIVATEKEY_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/PrivateKey.h"
#include "../../js_bindings/crypto_bindings.h"
#include "../../js_bindings/boss_bindings.h"

class UPrivateKey: public UObject {
private:
    class UPrivateKeyData : public UData {
    public:
        UPrivateKeyData();
        UPrivateKeyData(const crypto::PrivateKey &val);
        ~UPrivateKeyData() override = default;

        Local<Object> serializeToV8(Isolate* isolate) override {
            auto res = wrapPrivateKey(isolate, new crypto::PrivateKey(*privateKey.get()));
            auto obj = Local<Object>::Cast(res);
            auto unused = obj->SetPrototype(isolate->GetCurrentContext(), getPrivateKeyPrototype()->Get(isolate));
            return obj;
        }

        void dbgPrint(std::string prefix) override {
            printf("PrivateKey=<secret>\n");
        }

        std::shared_ptr<crypto::PrivateKey> privateKey;
    };

public:
    UPrivateKey();
    UPrivateKey(const crypto::PrivateKey &val);

    static bool isInstance(const UObject& object);
    static UPrivateKey& asInstance(UObject& object);
    static const UPrivateKey& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    crypto::PrivateKey& getPrivateKey();
};

#endif //U8_UPRIVATEKEY_H
