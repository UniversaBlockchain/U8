/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "cryptoCommon.h"
#include "cryptoCommonPrivate.h"
#include "PrivateKey.h"
#include "PublicKey.h"
#include "../tools/tools.h"

namespace crypto {

    static int hashIndexes[6];

    void initCrypto() {
        ltc_mp = gmp_desc;

        if (register_prng(&sprng_desc) == -1)
            throw std::runtime_error("Error registering sprng");

        if (register_hash(&sha1_desc) == -1)
            throw std::runtime_error("Error registering sha1");
        if (register_hash(&sha256_desc) == -1)
            throw std::runtime_error("Error registering sha256");
        if (register_hash(&sha512_desc) == -1)
            throw std::runtime_error("Error registering sha512");
        if (register_hash(&sha3_256_desc) == -1)
            throw std::runtime_error("Error registering sha3_256");
        if (register_hash(&sha3_384_desc) == -1)
            throw std::runtime_error("Error registering sha3_384");
        if (register_hash(&sha3_512_desc) == -1)
            throw std::runtime_error("Error registering sha3_512");

        if (register_cipher(&aes_desc) == -1)
            throw std::runtime_error("Error registering aes");

        hashIndexes[SHA1] = find_hash(sha1_desc.name);
        hashIndexes[SHA256] = find_hash(sha256_desc.name);
        hashIndexes[SHA512] = find_hash(sha512_desc.name);
        hashIndexes[SHA3_256] = find_hash(sha3_256_desc.name);
        hashIndexes[SHA3_384] = find_hash(sha3_384_desc.name);
        hashIndexes[SHA3_512] = find_hash(sha3_512_desc.name);

        {
            // Hack: sometimes we have got sigsegv immediately after start program.
            // It occurs at threads collision of first call rsa_sign_hash_ex
            // (fails deeper on call of mpz_random, what is not thread save).
            // All next calls of rsa_sign_hash_ex works fine, so maybe it is a bug in libtomcrypt.
            // To avoid this crash, we calls this function at initialization step.
            PrivateKey pk(2048);
            byte_vector data(64);
            memset(&data[0], 0, 64);
            byte_vector sig = pk.sign(data, HashType::SHA512);
            PublicKey pub(pk);
            bool verifyRes = pub.verify(sig, data, HashType::SHA512);
            if (!verifyRes)
                throw std::runtime_error("Error self test at crypto initialization.");
        }
    }

    int getHashIndex(HashType hashType) {
        return hashIndexes[hashType];
    }

    ltc_hash_descriptor getHashDescriptor(HashType hashType) {
        return hash_descriptor[hashIndexes[hashType]];
    }

    const char *getJavaHashName(HashType hashType) {
        switch (hashType) {
            case HashType::SHA1:
                return "SHA-1";
            case HashType::SHA256:
                return "SHA-256";
            case HashType::SHA512:
                return "SHA-512";
            case HashType::SHA3_256:
                return "SHA3-256";
            case HashType::SHA3_384:
                return "SHA3-384";
            case HashType::SHA3_512:
                return "SHA3-512";
            default:
                break; // to avoid -Wswitch on MIN/MAX
        }

        throw std::invalid_argument("unknown hash type");
    }

    size_t mpz_unsigned_bin_size(mpz_ptr p) {
        return (mpz_sizeinbase(p, 2) + 7) / 8;
    }

    void mpz_to_unsigned_bin(mpz_ptr p, unsigned char *buf) {
        mpz_export(buf, NULL, 1, 1, 1, 0, p);
    }

    Digest::Digest(HashType hashType) {
        desc = getHashDescriptor(hashType);
        desc.init(&md);
    }

    Digest::Digest(HashType hashType, const std::vector<unsigned char> &dataToHash) :
            Digest(hashType, (void *) &dataToHash[0], dataToHash.size()) {
    }

    Digest::Digest(HashType hashType, void *data, size_t size) : Digest(hashType) {
        update(data, size);
        doFinal();
    }

    void Digest::update(const std::vector<unsigned char> &data) {
        update((void *) &data[0], data.size());
    }

    void Digest::update(void *data, size_t size) {
        desc.process(&md, (unsigned char *) data, size);
    }

    void Digest::doFinal() {
        out.resize(desc.hashsize);
        desc.done(&md, &out[0]);
        desc.init(&md);
    }

    size_t Digest::getDigestSize() {
        return desc.hashsize;
    }

    std::vector<unsigned char> Digest::getDigest() const {
        return out;
    }

    RsaKeyWrapper::RsaKeyWrapper() {
        memset(&key, 0, sizeof(key));
    }

    RsaKeyWrapper::RsaKeyWrapper(const RsaKeyWrapper &copyFrom) {
        memset(&key, 0, sizeof(key));
        unsigned long sz = 4 * 1024;
        unsigned char buf[4 * 1024];
        rsa_export(buf, &sz, copyFrom.key.type, &copyFrom.key);
        if (sz > sizeof(buf))
            throw std::runtime_error(std::string("rsa_export error: output buffer too small"));
        rsa_import(buf, sz, &key);
    }

    RsaKeyWrapper::~RsaKeyWrapper() {
        rsa_free(&key);
    }

};