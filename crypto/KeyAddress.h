/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_KEYADDRESS_H
#define U8_KEYADDRESS_H

#include <vector>
#include <string>

namespace crypto {

    class PublicKey;

    class KeyAddress {

    public:
        KeyAddress();

        KeyAddress(const PublicKey &key, int typeMark, bool useSha3_384);

        KeyAddress(const std::string &packedString);

        KeyAddress(const std::vector<unsigned char> &packedSource);

        KeyAddress(void *packedSource, size_t packedSourceSize);

        std::string toString() const;

        bool operator==(const KeyAddress &other) const;

        bool isMatchingKeyAddress(const KeyAddress &other) const;

        bool isMatchingKey(const PublicKey &key) const;

        bool isLong() const;

        bool isInitialized() const;

        std::vector<unsigned char> getPacked() const { return packed; }

    protected:
        static int mask(const PublicKey &key);

    private:
        int keyMask;
        std::vector<unsigned char> keyDigest;
        bool isLong_;
        std::vector<unsigned char> packed;
        int typeMark;

    };

};

#endif //U8_KEYADDRESS_H
