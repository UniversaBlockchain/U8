//
// Created by Leonid Novikov on 14.01.19.
//

#ifndef U8_CRYPTO_H
#define U8_CRYPTO_H

#include <iostream>
#include <tomcrypt.h>
#include <gmp.h>
#include <vector>

enum HashType {
    SHA1=0,
    SHA256,
    SHA512,
    SHA3_256,
    SHA3_384,
    SHA3_512
};

static const HashType DEFAULT_MGF1_HASH = HashType::SHA1;

void initCrypto();
const char* getJavaHashName(HashType hashType);

class Digest {
public:
    Digest(HashType hashType);
    Digest(HashType hashType, const std::vector<unsigned char>& dataToHash);
    Digest(HashType hashType, void* data, size_t size);
    void update(const std::vector<unsigned char>& data);
    void update(void* data, size_t size);
    void doFinal();
    size_t getDigestSize();
    std::vector<unsigned char> getDigest() const;
private:
    hash_state md;
    ltc_hash_descriptor desc;
    std::vector<unsigned char> out;
};

#endif //U8_CRYPTO_H
