//
// Created by Leonid Novikov on 14.01.19.
//

#include "cryptoCommon.h"

static int hashIndexes[3];

void initCrypto() {
    ltc_mp = gmp_desc;

    if (register_prng(&sprng_desc) == -1)
        std::cout << "Error registering sprng" << std::endl;

    if (register_hash(&sha1_desc) == -1)
        std::cout << "Error registering sha1" << std::endl;
    if (register_hash(&sha512_desc) == -1)
        std::cout << "Error registering sha512" << std::endl;
    if (register_hash(&sha3_256_desc) == -1)
        std::cout << "Error registering sha3_256" << std::endl;

    hashIndexes[SHA1] = find_hash(sha1_desc.name);
    hashIndexes[SHA512] = find_hash(sha512_desc.name);
    hashIndexes[SHA3_256] = find_hash(sha3_256_desc.name);
    std::cout << sha3_256_desc.name << std::endl;
}

int getHashIndex(HashType hashType) {
    return hashIndexes[hashType];
}

ltc_hash_descriptor getHashDescriptor(HashType hashType) {
    return hash_descriptor[hashIndexes[hashType]];
}
