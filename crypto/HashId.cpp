//
// Created by Leonid Novikov on 2018-12-27.
//

#include <tomcrypt.h>
#include "HashId.h"
#include "gost3411-2012.h"
#include "base64.h"

HashId::HashId(const std::vector<unsigned char> &packedData) {
    initWith(packedData);
}

HashId::HashId(const HashId& copyFrom) {
    digest = copyFrom.digest;
}

std::shared_ptr<HashId> HashId::of(const std::vector<unsigned char> &packedData) {
    return std::make_shared<HashId>(packedData);
}

void HashId::initWith(const std::vector<unsigned char> &packedData) {
    if (digest.size() == 0) {
        const unsigned long gostSize = 256;
        digest.resize(sha512_256_desc.hashsize + sha3_256_desc.hashsize + gostSize / 8);

        hash_state md2;
        sha512_256_init(&md2);
        sha512_256_process(&md2, &packedData[0], packedData.size());
        sha512_256_done(&md2, &digest[0]);

        hash_state md3;
        sha3_256_init(&md3);
        sha3_process(&md3, &packedData[0], packedData.size());
        sha3_done(&md3, &digest[sha512_256_desc.hashsize]);

        size_t len = 0;
        gost3411_2012_get_digest(gostSize, &packedData[0], packedData.size(),
                                 &digest[sha512_256_desc.hashsize + sha3_256_desc.hashsize], &len);
    } else {
        //TODO: throw error
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
