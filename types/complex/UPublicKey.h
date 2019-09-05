/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_UPUBLICKEY_H
#define U8_UPUBLICKEY_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/PublicKey.h"
#include "../../js_bindings/crypto_bindings.h"
#include "../../js_bindings/boss_bindings.h"

class UPublicKey: public UObject {
private:
    class UPublicKeyData : public UData {
    public:
        UPublicKeyData();
        UPublicKeyData(const crypto::PublicKey &val);
        ~UPublicKeyData() override = default;

        Local<Object> serializeToV8(Scripter& scripter, Isolate* isolate) override {
            auto res = wrapPublicKey(scripter, isolate, new crypto::PublicKey(*publicKey.get()));
            auto obj = Local<Object>::Cast(res);
            auto unused = obj->SetPrototype(isolate->GetCurrentContext(), getPublicKeyPrototype(scripter)->Get(isolate));
            return obj;
        }

        void dbgPrint(std::string prefix) override {
            printf("PublicKey, shortAddr=%s\n", publicKey->getShortAddress().toString().data());
        }

        std::shared_ptr<crypto::PublicKey> publicKey;
    };

public:
    UPublicKey();
    UPublicKey(const crypto::PublicKey &val);

    static bool isInstance(const UObject& object);
    static UPublicKey& asInstance(UObject& object);
    static const UPublicKey& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    crypto::PublicKey& getPublicKey();
};

#endif //U8_UPUBLICKEY_H
