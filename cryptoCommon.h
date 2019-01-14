//
// Created by Leonid Novikov on 14.01.19.
//

#ifndef U8_CRYPTO_H
#define U8_CRYPTO_H

#include <iostream>
#include <tomcrypt.h>

enum HashType {
    SHA1,
    SHA512,
    SHA3_256
};

void initCrypto();
int getHashIndex(HashType hashType);
ltc_hash_descriptor getHashDescriptor(HashType hashType);

#endif //U8_CRYPTO_H
