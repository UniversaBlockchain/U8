//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PRIVATEKEY_H
#define UNITOOLS_PRIVATEKEY_H

#include <memory>
#include <string>
#include <vector>
#include <tomcrypt.h>
#include "cryptoCommon.h"
#include "../types/UBytes.h"

class PublicKey;

class PrivateKey {

public:

	PrivateKey(const std::string& strE, const std::string& strP, const std::string& strQ);
	PrivateKey(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue);
    PrivateKey(const std::vector<unsigned char>& packedBinaryKey);
    PrivateKey(const PrivateKey& copyFrom);

	virtual ~PrivateKey();

	std::vector<unsigned char> pack() const;

	// Signature is created using RSA-PSS as described in PKCS# 1 v 2.1.
	void sign(std::vector<unsigned char> &input, HashType hashType, std::vector<unsigned char> &output);

	void decrypt(std::vector<unsigned char> &encrypted, std::vector<unsigned char> &output);

	friend class PublicKey;

private:

	void initFromBytes(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue);
	void initFromDecimalStrings(const std::string& strE, const std::string& strP, const std::string& strQ);

private:

	rsa_key key;

};

#endif //UNITOOLS_PRIVATEKEY_H
