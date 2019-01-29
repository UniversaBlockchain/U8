//
// Created by Leonid Novikov on 21.01.19.
//

#include "KeyAddress.h"
#include "PublicKey.h"
#include <unordered_map>
#include <algorithm>
#include "cryptoCommonPrivate.h"
#include "base64.h"
#include "Safe58.h"

KeyAddress::KeyAddress() {
}

KeyAddress::KeyAddress(const PublicKey& key, int typeMark, bool useSha3_384) {
    this->typeMark = typeMark;
    if ((typeMark & 0xF0) != 0)
        throw std::invalid_argument(std::string("type mark must be in [0..15] range"));

    keyMask = mask(key);

    HashType hashType = useSha3_384 ? HashType::SHA3_384 : HashType::SHA3_256;
    auto digestIndx = getHashIndex(hashType);
    auto digestDesc = getHashDescriptor(hashType);
    isLong = useSha3_384;

    packed.resize(1 + 4 + digestDesc.hashsize);
    packed[0] = (char)(((keyMask << 4) | typeMark) & 0xFF);

    std::vector<unsigned char> keyComponents;
    key.getKeyComponentsAsBytes(keyComponents);
    keyDigest.resize(digestDesc.hashsize);
    unsigned long outLen = keyDigest.size();
    hash_memory(digestIndx, &keyComponents[0], keyComponents.size(), &keyDigest[0], &outLen);

    memcpy(&packed[1], &keyDigest[0], outLen);

    crc32_state ctx;
    crc32_init(&ctx);
    crc32_update(&ctx, &packed[0], 1 + outLen);
    crc32_finish(&ctx, &packed[1 + outLen], 4);
}

KeyAddress::KeyAddress(const std::string& packedString): KeyAddress(Safe58::decode(packedString)) {
}

KeyAddress::KeyAddress(const std::vector<unsigned char>& packedSource) {
    packed = packedSource;
    typeMark = packedSource[0] & 0x0F;
    keyMask = (packedSource[0] & 0xFF) >> 4;

    if (keyMask == 0)
        throw std::invalid_argument(std::string("keyMask is 0"));

    isLong = packedSource.size() == 53;

    HashType hashType = isLong ? HashType::SHA3_384 : HashType::SHA3_256;
    auto digestDesc = getHashDescriptor(hashType);

    int digestLength1 = digestDesc.hashsize + 1;
    keyDigest.resize(digestDesc.hashsize);
    memcpy(&keyDigest[0], &packed[1], digestDesc.hashsize);

    crc32_state ctx;
    crc32_init(&ctx);
    crc32_update(&ctx, &packed[0], digestLength1);
    std::vector<unsigned char> crc32;
    std::vector<unsigned char> crc32packed;
    crc32.resize(4);
    crc32packed.resize(4);
    crc32_finish(&ctx, &crc32[0], 4);
    memcpy(&crc32packed[0], &packed[digestLength1], 4);
    if (!std::equal(crc32.begin(), crc32.end(), crc32packed.begin()))
        throw std::invalid_argument(std::string("control code failed, address is broken"));
}

int KeyAddress::mask(const PublicKey& key) {
    if (key.getPublicExponent() == 0x10001) {
        int l = key.getBitStrength() / 8;
        if (l == 2048 / 8)
            return 0x01;
        if (l == 4096 / 8)
            return 0x02;
    }
    throw std::invalid_argument(std::string("key can't be masked for address"));
}

std::string KeyAddress::toString() const {
    return Safe58::encode(packed);
}

bool KeyAddress::operator==(const KeyAddress& other) const {
    if (packed.size() != other.packed.size())
        return false;
    return std::equal(packed.begin(), packed.end(), other.packed.begin());
}

bool KeyAddress::isMatchingKeyAddress(const KeyAddress& other) const {
    return *this == other;
}

bool KeyAddress::isMatchingKey(const PublicKey& key) const {
    KeyAddress other(key, 0, isLong);
    return isMatchingKeyAddress(other);
}

bool KeyAddress::isInitialized() const {
    return !packed.empty();
}
