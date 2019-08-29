/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_CRYPTOCOMMONPRIVATE_H
#define U8_CRYPTOCOMMONPRIVATE_H

#include "cryptoCommon.h"

namespace crypto {

    int getHashIndex(HashType hashType);

    ltc_hash_descriptor getHashDescriptor(HashType hashType);

    size_t mpz_unsigned_bin_size(mpz_ptr p);

    void mpz_to_unsigned_bin(mpz_ptr p, unsigned char *buf);

    class RsaKeyWrapper {
    public:
        rsa_key key;

        RsaKeyWrapper();

        RsaKeyWrapper(const RsaKeyWrapper &copyFrom);

        ~RsaKeyWrapper();
    };

};

#endif //U8_CRYPTOCOMMONPRIVATE_H
