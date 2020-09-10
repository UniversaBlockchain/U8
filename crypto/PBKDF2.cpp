/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "PBKDF2.h"
#include "cryptoCommonPrivate.h"

namespace crypto {

PBKDF2::PBKDF2(crypto::HashType hashType, const std::string& password, const byte_vector& salt, int c, int dkLen) {
    hashType_ = hashType;
    passwordBytes_ = stringToBytes(password);
    salt_ = salt;
    c_ = c;
    dkLen_ = dkLen;
    hLen_ = (int)crypto::Digest(hashType).getDigestSize();
}

byte_vector PBKDF2::derive(crypto::HashType hashType, const std::string& password, const byte_vector& salt, int c, int dkLen) {
    return PBKDF2(hashType, password, salt, c, dkLen).compute();
}

byte_vector PBKDF2::compute() {
    if (!isComputed_) {

        int nBlocks = (dkLen_ + hLen_ - 1) / hLen_;
        byte_vector result(size_t(nBlocks * hLen_));

        for (int i = 0; i < nBlocks; ++i) {
            byte_vector f = F(i+1);
            memcpy(&result[i*hLen_], &f[0], (size_t)hLen_);
        }
        computed_.resize((size_t)dkLen_);
        zeromem(&computed_[0], computed_.size());
        memcpy(&computed_[0], &result[0], (size_t)dkLen_);

        isComputed_ = true;
    }
    return computed_;
}

byte_vector PBKDF2::F(int i) {
    unsigned char b;
    hmac_state hs;
    hmac_init(&hs, crypto::getHashIndex(hashType_), &passwordBytes_[0], passwordBytes_.size());

    hmac_process(&hs, &salt_[0], salt_.size());
    b = (unsigned char) ((i>>24) & 0xFF);
    hmac_process(&hs, &b, 1);
    b = (unsigned char) ((i>>16) & 0xFF);
    hmac_process(&hs, &b, 1);
    b = (unsigned char) ((i>>8) & 0xFF);
    hmac_process(&hs, &b, 1);
    b = (unsigned char) ((i) & 0xFF);
    hmac_process(&hs, &b, 1);

    byte_vector block(crypto::getHashDescriptor(hashType_).hashsize);
    size_t sz = block.size();
    hmac_done(&hs, &block[0], &sz);
    byte_vector u1 = block;

    for (int k = 1; k < c_; ++k) {
        byte_vector u2(block.size());
        sz = u2.size();
        hmac_memory(crypto::getHashIndex(hashType_), &passwordBytes_[0], passwordBytes_.size(), &u1[0], u1.size(), &u2[0], &sz);
        for (int j = 0; j < hLen_; ++j) {
            block[j] ^= u2[j];
        }
        u1 = u2;
    }
    return block;
}

}
