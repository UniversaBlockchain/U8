/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "KeyAddress.h"
#include "PublicKey.h"
#include <unordered_map>
#include <algorithm>
#include "cryptoCommonPrivate.h"
#include "base64.h"
#include "Safe58.h"

namespace crypto {

    KeyAddress::KeyAddress() {
    }

    KeyAddress::KeyAddress(const PublicKey &key, int typeMark, bool useSha3_384) {
        this->typeMark = typeMark;
        if ((typeMark & 0xF0) != 0)
            throw std::invalid_argument(std::string("type mark must be in [0..15] range"));

        keyMask = mask(key);

        HashType hashType = useSha3_384 ? HashType::SHA3_384 : HashType::SHA3_256;
        auto digestIndx = getHashIndex(hashType);
        auto digestDesc = getHashDescriptor(hashType);
        isLong_ = useSha3_384;

        packed.resize(1 + 4 + digestDesc.hashsize);
        packed[0] = (char) (((keyMask << 4) | typeMark) & 0xFF);

        auto keyComponents = key.getKeyComponentsAsBytes();
        keyDigest.resize(digestDesc.hashsize);
        unsigned long outLen = keyDigest.size();
        hash_memory(digestIndx, &keyComponents[0], keyComponents.size(), &keyDigest[0], &outLen);

        memcpy(&packed[1], &keyDigest[0], outLen);

        crc32_state ctx;
        crc32_init(&ctx);
        crc32_update(&ctx, &packed[0], 1 + outLen);
        crc32_finish(&ctx, &packed[1 + outLen], 4);
    }

    KeyAddress::KeyAddress(const std::string &packedString) : KeyAddress(Safe58::decode(packedString)) {
    }

    KeyAddress::KeyAddress(const std::vector<unsigned char> &packedSource) :
            KeyAddress((void *) &packedSource[0], packedSource.size()) {
    }

    KeyAddress::KeyAddress(void *packedSource, size_t packedSourceSize) {
        packed.resize(packedSourceSize);
        memcpy(&packed[0], packedSource, packedSourceSize);
        typeMark = packed[0] & 0x0F;
        keyMask = (packed[0] & 0xFF) >> 4;

        if (keyMask == 0)
            throw std::invalid_argument(std::string("keyMask is 0"));

        isLong_ = packedSourceSize == 53;

        HashType hashType = isLong_ ? HashType::SHA3_384 : HashType::SHA3_256;
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

    int KeyAddress::mask(const PublicKey &key) {
        if (key.getPublicExponent() == 0x10001) {
            int l = key.getBitStrength() / 8;
            switch (l) {
                case 2048 / 8:
                    return 0x01;
                case 4096 / 8:
                    return 0x02;
                case 8192 / 8:
                    return 0x03;
            }
        }
        throw std::invalid_argument(std::string("key can't be masked for address"));
    }

    std::string KeyAddress::toString() const {
        return Safe58::encode(packed);
    }

    bool KeyAddress::operator==(const KeyAddress &other) const {
        if (packed.size() != other.packed.size())
            return false;
        return std::equal(packed.begin(), packed.end(), other.packed.begin());
    }

    bool KeyAddress::isMatchingKeyAddress(const KeyAddress &other) const {
        return *this == other;
    }

    bool KeyAddress::isMatchingKey(const PublicKey &key) const {
        KeyAddress other(key, 0, isLong_);
        return isMatchingKeyAddress(other);
    }

    bool KeyAddress::isLong() const {
        return isLong_;
    }

    bool KeyAddress::isInitialized() const {
        return !packed.empty();
    }

};