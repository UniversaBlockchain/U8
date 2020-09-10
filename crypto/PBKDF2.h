/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_PBKDF2_H
#define U8_PBKDF2_H

#include "cryptoCommon.h"
#include "../tools/tools.h"

namespace crypto {

class PBKDF2 {
public:
    PBKDF2(crypto::HashType hashType, const std::string& password, const byte_vector& salt, int c, int dkLen);
    static byte_vector derive(crypto::HashType hashType, const std::string& password, const byte_vector& salt, int c, int dkLen);
private:
    byte_vector compute();
    byte_vector F(int i);
private:
    crypto::HashType hashType_;
    byte_vector salt_;
    int c_;
    int dkLen_;
    int hLen_;
    bool isComputed_ = false;
    byte_vector computed_;
    byte_vector passwordBytes_;
};

}

#endif //U8_PBKDF2_H
