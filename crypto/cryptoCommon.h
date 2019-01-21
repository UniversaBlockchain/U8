//
// Created by Leonid Novikov on 14.01.19.
//

#ifndef U8_CRYPTO_H
#define U8_CRYPTO_H

#include <iostream>
#include <tomcrypt.h>
#include <gmp.h>

enum HashType {
    SHA1,
    SHA512,
    SHA3_256,
    SHA3_384,
    SHA3_512
};

static const HashType DEFAULT_MGF1_HASH = HashType::SHA1;

void initCrypto();
int getHashIndex(HashType hashType);
ltc_hash_descriptor getHashDescriptor(HashType hashType);
const char* getJavaHashName(HashType hashType);

size_t mpz_unsigned_bin_size(mpz_ptr p);
void mpz_to_unsigned_bin(mpz_ptr p, unsigned char* buf);

#endif //U8_CRYPTO_H
