//
// Created by flint on 8/3/19.
//

#ifndef U8_KEYRECORD_H
#define U8_KEYRECORD_H

#include "../crypto/PublicKey.h"

class KeyRecord {
public:
    std::shared_ptr<crypto::PublicKey> publicKey;
};

#endif //U8_KEYRECORD_H
