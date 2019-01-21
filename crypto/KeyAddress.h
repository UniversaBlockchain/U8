//
// Created by Leonid Novikov on 21.01.19.
//

#ifndef U8_KEYADDRESS_H
#define U8_KEYADDRESS_H

#include <vector>
#include "PublicKey.h"

class KeyAddress {

public:
    KeyAddress(const PublicKey& key, int typeMark, bool useSha3_384);

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
