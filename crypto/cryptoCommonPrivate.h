//
// Created by flint on 1/28/19.
//

#ifndef U8_CRYPTOCOMMONPRIVATE_H
#define U8_CRYPTOCOMMONPRIVATE_H

#include "cryptoCommon.h"

int getHashIndex(HashType hashType);

ltc_hash_descriptor getHashDescriptor(HashType hashType);

size_t mpz_unsigned_bin_size(mpz_ptr p);

void mpz_to_unsigned_bin(mpz_ptr p, unsigned char* buf);

#endif //U8_CRYPTOCOMMONPRIVATE_H
