//
// Created by Leonid Novikov on 21.01.19.
//

#ifndef U8_KEYADDRESS_H
#define U8_KEYADDRESS_H

#include <vector>
#include <string>

class PublicKey;

class KeyAddress {

public:
    KeyAddress();
    KeyAddress(const PublicKey& key, int typeMark, bool useSha3_384);
    KeyAddress(const std::string& packedString);
    KeyAddress(const std::vector<unsigned char>& packedString);

    std::string toString() const;

    bool operator==(const KeyAddress& other) const;

    bool isInitialized() const;

protected:
    static int mask(const PublicKey& key);

private:
    int keyMask;
    std::vector<unsigned char> keyDigest;
    bool isLong;
    std::vector<unsigned char> packed;
    int typeMark;

};

#endif //U8_KEYADDRESS_H
