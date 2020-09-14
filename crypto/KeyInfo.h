/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_KEYINFO_H
#define U8_KEYINFO_H

#include "../tools/tools.h"
#include "SymmetricKey.h"

namespace crypto {

class KeyInfo {

public:
    enum class Algorythm {
        UNKNOWN      = 0,
        RSAPublic    = 1,
        RSAPrivate   = 2,
        AES256       = 3
    };

    // Pseudo-random function
    enum class PRF {
        None          = 0,
        HMAC_SHA1     = 1,
        HMAC_SHA256   = 2,
        HMAC_SHA512   = 3
    };
    static PRF PRFFromName(const std::string& name);

public:
    explicit KeyInfo(const byte_vector& packedBinary);
    KeyInfo(KeyInfo::PRF prf, int rounds, const byte_vector& salt, std::shared_ptr<byte_vector> tag);
    bool isPassword();
    crypto::SymmetricKey derivePassword(const std::string& pswd);
    byte_vector pack();

private:
    void checkSanity();

private:
    std::shared_ptr<byte_vector> salt = nullptr;
    std::shared_ptr<byte_vector> tag = nullptr;
    int rounds = 0;
    Algorythm algorythm;
    PRF prf = PRF::None;
    int keyLength;

};

}

#endif //U8_KEYINFO_H
