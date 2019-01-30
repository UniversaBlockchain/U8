//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PRIVATEKEY_H
#define UNITOOLS_PRIVATEKEY_H

#include <memory>
#include <string>
#include <vector>
#include <tomcrypt.h>
#include "cryptoCommonPrivate.h"
#include "../types/UBytes.h"

class PublicKey;

class PrivateKey {

public:

	PrivateKey(const std::string& strE, const std::string& strP, const std::string& strQ);
	PrivateKey(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue);
    PrivateKey(const std::vector<unsigned char>& packedBinaryKey);
	PrivateKey(void* packedBinaryKeyData, size_t packedBinaryKeySize);
    PrivateKey(int bitStrength);

	std::vector<unsigned char> pack() const;

	// Signature is created using RSA-PSS as described in PKCS# 1 v 2.1.
	void sign(const std::vector<unsigned char> &input, HashType hashType, std::vector<unsigned char> &output);
	std::vector<unsigned char> sign(const std::vector<unsigned char> &input, HashType hashType);
	std::vector<unsigned char> sign(void* data, size_t size, HashType hashType);

	void decrypt(const std::vector<unsigned char> &encrypted, std::vector<unsigned char> &output);
	std::vector<unsigned char> decrypt(const std::vector<unsigned char> &encrypted);
	std::vector<unsigned char> decrypt(void* data, size_t size);

	friend class PublicKey;

private:

	void initFromBytes(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue);
	void initFromDecimalStrings(const std::string& strE, const std::string& strP, const std::string& strQ);
	void generate(int bitStrength);

private:

	RsaKeyWrapper key;

};

#endif //UNITOOLS_PRIVATEKEY_H
