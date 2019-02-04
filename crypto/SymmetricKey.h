//
// Created by Leonid Novikov on 2/4/19.
//

#ifndef U8_SYMMETRICKEY_H
#define U8_SYMMETRICKEY_H

#include <tomcrypt.h>
#include "../tools/tools.h"

class SymmetricKey {

public:
    SymmetricKey();
    SymmetricKey(const byte_vector& key);
    SymmetricKey(void* keyData, size_t keyDataSize);

    byte_vector pack();

    byte_vector etaDecrypt(const byte_vector& data);
    byte_vector etaDecrypt(void* data, size_t size);

    byte_vector etaEncrypt(const byte_vector& data);
    byte_vector etaEncrypt(void* data, size_t size);

private:
    const ltc_cipher_descriptor cipher_desc = aes_desc;
    byte_vector key;

};

#endif //U8_SYMMETRICKEY_H
