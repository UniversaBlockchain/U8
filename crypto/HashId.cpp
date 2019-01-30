//
// Created by Leonid Novikov on 2018-12-27.
//

#include <tomcrypt.h>
#include "HashId.h"
#include "gost3411-2012.h"
#include "base64.h"

HashId::HashId(const std::vector<unsigned char> &packedData): HashId((void*)&packedData[0], packedData.size()) {
}

HashId::HashId(void* data, size_t size) {
    initWith(data, size);
}

HashId::HashId(const HashId& copyFrom) {
    digest = copyFrom.digest;
}

HashId HashId::of(const std::vector<unsigned char> &packedData) {
    return HashId(packedData);
}

HashId HashId::of(void* data, size_t size) {
    return HashId(data, size);
}

void HashId::initWith(const std::vector<unsigned char> &packedData) {
    initWith((void*)&packedData[0], packedData.size());
}

void HashId::initWith(void* data, size_t size) {
    if (digest.size() == 0) {
        const unsigned long gostSize = 256;
        digest.resize(sha512_256_desc.hashsize + sha3_256_desc.hashsize + gostSize / 8);

        hash_state md2;
        sha512_256_init(&md2);
        sha512_256_process(&md2, (unsigned char*)data, size);
        sha512_256_done(&md2, &digest[0]);

        hash_state md3;
        sha3_256_init(&md3);
        sha3_process(&md3, (unsigned char*)data, size);
        sha3_done(&md3, &digest[sha512_256_desc.hashsize]);

        size_t len = 0;
        gost3411_2012_get_digest(gostSize, (unsigned char*)data, size,
                                 &digest[sha512_256_desc.hashsize + sha3_256_desc.hashsize], &len);
    } else {
        throw std::runtime_error("HashId is already initialized");
    }
}

std::string HashId::toBase64() {
    return base64_encode(&digest[0], digest.size());
}

std::vector<unsigned char> HashId::getDigest() {
    return digest;
}

bool HashId::operator<(const HashId& other) const {
    if (digest.size() != other.digest.size()) {
        //TODO: throw error
        return false;
    }
    for (int i = 0; i < digest.size(); i++) {
        if (digest[i] < other.digest[i])
            return true;
        if (digest[i] > other.digest[i])
            return false;
    }
    return false;
}

bool HashId::operator==(const HashId& other) const {
    if (digest.size() != other.digest.size())
        return false;
    return std::equal(digest.begin(), digest.end(), other.digest.begin());
}

size_t HashId::hashCode() const {
    return std::hash<std::string>()(std::string(digest.begin(), digest.end()));
}

size_t HashId::UnorderedHash::operator()(const HashId& val) const {
    return val.hashCode();
}
