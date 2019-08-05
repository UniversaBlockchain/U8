//
// Created by flint on 8/3/19.
//

#ifndef U8_KEYRECORD_H
#define U8_KEYRECORD_H

#include "ISerializableV8.h"
#include "../crypto/PublicKey.h"

class KeyRecord: public ISerializableV8 {
public:
    std::shared_ptr<crypto::PublicKey> publicKey;

    Local<Object>& serializeToV8(Isolate* isolate, Local<Object>& dst) override {
        //TODO: wrap public key
        return dst;
    }
};

#endif //U8_KEYRECORD_H
