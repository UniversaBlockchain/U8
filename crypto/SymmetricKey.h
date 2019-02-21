//
// Created by Leonid Novikov on 2/4/19.
//

#ifndef U8_SYMMETRICKEY_H
#define U8_SYMMETRICKEY_H

#include <tomcrypt.h>
#include "../tools/tools.h"

namespace crypto {

    class SymmetricKey {

    public:

        /**
         * Create random symmetric key (AES256, CTR)
         */
        SymmetricKey();

        /**
         * Create symmetric key from a packed data
         */
        SymmetricKey(const byte_vector &key);

        /**
         * \see SymmetricKey(const byte_vector& key)
         */
        SymmetricKey(void *keyData, size_t keyDataSize);

        SymmetricKey(const SymmetricKey&) = default;
        SymmetricKey(SymmetricKey&&) = default;
        SymmetricKey& operator=(const SymmetricKey&) = default;
        SymmetricKey& operator=(SymmetricKey &&) = default;

        /**
         * Returns packed key data
         */
        byte_vector pack();

        /**
         * Encrypt data using AE (EtA) with HMAC based on SHA256
         */
        byte_vector etaDecrypt(const byte_vector &data) const;

        /**
         * \see byte_vector etaDecrypt(const byte_vector& data)
         */
        byte_vector etaDecrypt(void *data, size_t size) const;

        /**
         * Decrypt data using AE (EtA) with SHA256-based HMAC
         */
        byte_vector etaEncrypt(const byte_vector &data) const;

        /**
         * \see byte_vector etaEncrypt(const byte_vector& data)
         */
        byte_vector etaEncrypt(void *data, size_t size) const;

    private:
        byte_vector key;

    };

};

#endif //U8_SYMMETRICKEY_H
