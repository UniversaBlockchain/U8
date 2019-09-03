/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "CTRTransformerAES.h"
#include <cstring>
#include <stdexcept>
#include <tomcrypt.h>

namespace crypto {

    CTRTransformerAES::CTRTransformerAES(const byte_vector &key) :
            CTRTransformerAES(key, byte_vector()) {
    }

    CTRTransformerAES::CTRTransformerAES(const byte_vector &key, const byte_vector &iv) :
            key(key),
            blockSize(aes_desc.block_length) {
        if (iv.empty()) {
            nonce.resize(blockSize);
            sprng_read(&nonce[0], blockSize, NULL);
        } else {
            nonce = iv;
        }
        counter = 0;
        source.resize(blockSize);
        counterBytes.resize(4);
        prepareBlock();
    }

    unsigned char CTRTransformerAES::transformByte(unsigned char source) {
        return source ^ nextByte();
    }

    byte_vector CTRTransformerAES::getIV() {
        return nonce;
    }

    unsigned char CTRTransformerAES::nextByte() {
        if (index >= blockSize)
            prepareBlock();
        return source[index++];
    }

    void CTRTransformerAES::prepareBlock() {
        memcpy(&source[0], &nonce[0], blockSize);
        counterBytes[0] = (unsigned char) (counter >> 24);
        counterBytes[1] = (unsigned char) (counter >> 16);
        counterBytes[2] = (unsigned char) (counter >> 8);
        counterBytes[3] = (unsigned char) counter;
        applyXor(source, blockSize - 4, counterBytes);

        symmetric_key skey;
        aes_setup(&key[0], key.size(), 0, &skey);
        //aes_ecb_decrypt(&source[0], &source[0], &skey);
        aes_ecb_encrypt(&source[0], &source[0], &skey);

        ++counter;
        index = 0;
    }

    void applyXor(byte_vector &source, int offset, const byte_vector &mask) {
        int end = offset + (int) mask.size();
        if (end > (int) source.size())
            throw std::invalid_argument("source is too short for this offset and mask");
        int sourceIndex = offset;
        int maskIndex = 0;
        do {
            source[sourceIndex++] ^= mask[maskIndex++];
        } while (sourceIndex < end);
    }

};