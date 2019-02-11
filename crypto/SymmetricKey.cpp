//
// Created by Leonid Novikov on 2/4/19.
//

#include "SymmetricKey.h"
#include "CTRTransformerAES.h"
#include <tomcrypt.h>
#include <queue>

namespace crypto {

    const static ltc_cipher_descriptor cipher_desc = aes_desc;

    SymmetricKey::SymmetricKey() {
        this->key.resize(32);
        sprng_read(&key[0], 32, NULL);
    }

    SymmetricKey::SymmetricKey(const byte_vector &key) :
            SymmetricKey((void *) &key[0], key.size()) {
    }

    SymmetricKey::SymmetricKey(void *keyData, size_t keyDataSize) {
        key.resize(keyDataSize);
        memcpy(&key[0], keyData, keyDataSize);
    }

    byte_vector SymmetricKey::pack() {
        return key;
    }

    byte_vector SymmetricKey::etaDecrypt(const byte_vector &data) const {
        return etaDecrypt((void *) &data[0], data.size());
    }

    byte_vector SymmetricKey::etaDecrypt(void *data, size_t size) const {
        byte_vector output;

        if (size < cipher_desc.block_length + sha256_desc.hashsize)
            throw std::invalid_argument("input data size too small");

        byte_vector iv(cipher_desc.block_length);
        memcpy(&iv[0], data, iv.size());
        CTRTransformerAES transformerAES(key, iv);

        hmac_state hs;
        hmac_init(&hs, find_hash(sha256_desc.name), &key[0], key.size());

        std::deque<unsigned char> ring;
        for (int i = iv.size(); i < iv.size() + sha256_desc.hashsize; ++i)
            ring.push_back(((unsigned char *) data)[i]);

        int readIndex = iv.size() + sha256_desc.hashsize;
        int bytesLeft = size - readIndex;
        while (bytesLeft > 0) {
            unsigned char nextByte = ((unsigned char *) data)[readIndex++];
            --bytesLeft;
            ring.push_back(nextByte);
            unsigned char encrypted = ring.front();
            ring.pop_front();
            hmac_process(&hs, &encrypted, 1);
            output.push_back(transformerAES.transformByte(encrypted));
        }

        unsigned long hmacOutLen = sha256_desc.hashsize;
        if (ring.size() != hmacOutLen)
            throw std::invalid_argument("data corrupted: bad hmac record size");
        byte_vector hmacOut(hmacOutLen);
        hmac_done(&hs, &hmacOut[0], &hmacOutLen);
        if (hmacOut != byte_vector(ring.begin(), ring.end()))
            throw std::invalid_argument("HMAC authentication failed, data corrupted");

        return output;
    }

    byte_vector SymmetricKey::etaEncrypt(const byte_vector &data) const {
        return etaEncrypt((void *) &data[0], data.size());
    }

    byte_vector SymmetricKey::etaEncrypt(void *data, size_t size) const {
        byte_vector output;

        hmac_state hs;
        hmac_init(&hs, find_hash(sha256_desc.name), &key[0], key.size());

        CTRTransformerAES transformerAES(key);
        auto iv = transformerAES.getIV();
        output.insert(output.end(), iv.begin(), iv.end());

        for (int i = 0; i < size; ++i) {
            unsigned char encrypted = transformerAES.transformByte(((unsigned char *) data)[i]);
            hmac_process(&hs, &encrypted, 1);
            output.push_back(encrypted);
        }

        unsigned long hmacOutLen = sha256_desc.hashsize;
        byte_vector hmacOut(hmacOutLen);
        hmac_done(&hs, &hmacOut[0], &hmacOutLen);
        output.insert(output.end(), hmacOut.begin(), hmacOut.end());

        return output;
    }

};