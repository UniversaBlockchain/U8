//
// Created by flint on 7/29/19.
//

#ifndef U8_UHASHID_H
#define U8_UHASHID_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/HashId.h"
#include "../../js_bindings/crypto_bindings.h"
#include "../../js_bindings/boss_bindings.h"

class UHashId: public UObject {
private:
    class UHashIdData : public UData {
    public:
        UHashIdData();
        UHashIdData(const crypto::HashId &val);
        ~UHashIdData() override = default;

        Local<Object> serializeToV8(Isolate* isolate) override {
            auto res = wrapHashId(isolate, new crypto::HashId(*hashId.get()));
            auto obj = Local<Object>::Cast(res);
            auto unused = obj->SetPrototype(isolate->GetCurrentContext(), getHashIdPrototype()->Get(isolate));
            return obj;
        }

        std::shared_ptr<crypto::HashId> hashId;
    };

public:
    UHashId();
    UHashId(const crypto::HashId &val);

    static bool isInstance(const UObject& object);
    static UHashId& asInstance(UObject& object);
    static const UHashId& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    crypto::HashId& getHashId();
};

#endif //U8_UHASHID_H
