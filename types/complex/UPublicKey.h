//
// Created by flint on 8/3/19.
//

#ifndef U8_UPUBLICKEY_H
#define U8_UPUBLICKEY_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/PublicKey.h"
#include "../../js_bindings/crypto_bindings.h"

class UPublicKey: public UObject {
private:
    class UPublicKeyData : public UData {
    public:
        UPublicKeyData();
        UPublicKeyData(const crypto::PublicKey &val);
        ~UPublicKeyData() override = default;

        Local<Object> serializeToV8(Isolate* isolate) override {
            auto res = wrapPublicKey(isolate, new crypto::PublicKey(*publicKey.get()));
            return Local<Object>::Cast(res);
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
