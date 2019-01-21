//
// Created by Leonid Novikov on 21.01.19.
//

#include "KeyAddress.h"
#include <unordered_map>
#include <algorithm>
#include "base64.h"

KeyAddress::KeyAddress(const PublicKey& key, int typeMark, bool useSha3_384) {
    this->typeMark = typeMark;
    if ((typeMark & 0xF0) != 0) {
        //TODO: throw new IllegalArgumentException("type mark must be in [0..15] range");
    }

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

    printf("~~~ %zu, packed: %s\n", outLen, base64_encode(&packed[0], packed.size()).c_str());
}

int KeyAddress::mask(const PublicKey& key) {
    if (key.getPublicExponent() == 0x10001) {
        int l = key.getBitStrength() / 8;
        if (l == 2048 / 8)
            return 0x01;
        if (l == 4096 / 8)
            return 0x02;
    }
    //TODO: throw new IllegalArgumentException("key can't be masked for address: " + i);
    return 77;
}
