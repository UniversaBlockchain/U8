//
// Created by Leonid Novikov on 14.01.19.
//

#include "cryptoCommon.h"

static int hashIndexes[5];

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
    if (register_hash(&sha3_384_desc) == -1)
        std::cout << "Error registering sha3_384" << std::endl;
    if (register_hash(&sha3_512_desc) == -1)
        std::cout << "Error registering sha3_512" << std::endl;

    hashIndexes[SHA1] = find_hash(sha1_desc.name);
    hashIndexes[SHA512] = find_hash(sha512_desc.name);
    hashIndexes[SHA3_256] = find_hash(sha3_256_desc.name);
    hashIndexes[SHA3_384] = find_hash(sha3_384_desc.name);
    hashIndexes[SHA3_512] = find_hash(sha3_512_desc.name);
}

int getHashIndex(HashType hashType) {
    return hashIndexes[hashType];
}

ltc_hash_descriptor getHashDescriptor(HashType hashType) {
    return hash_descriptor[hashIndexes[hashType]];
}

const char* getJavaHashName(HashType hashType) {
    switch (hashType) {
        case HashType::SHA1:     return "SHA-1";
        //case HashType::SHA256:   return "SHA-256";
        case HashType::SHA512:   return "SHA-512";
        case HashType::SHA3_256: return "SHA3-256";
        case HashType::SHA3_384: return "SHA3-384";
        case HashType::SHA3_512: return "SHA3-512";
    }

    //TODO: throw error

    return "UnknownHashType";
}

size_t mpz_unsigned_bin_size(mpz_ptr p) {
    return (mpz_sizeinbase(p, 2) + 7) / 8;
}

void mpz_to_unsigned_bin(mpz_ptr p, unsigned char* buf) {
    mpz_export(buf, NULL, 1, 1, 1, 0, p);
}
