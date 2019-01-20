//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PRIVATEKEY_H
#define UNITOOLS_PRIVATEKEY_H

#include <memory>
#include <string>
#include <vector>
#include <tomcrypt.h>
#include "PublicKey.h"
#include "cryptoCommon.h"

class PrivateKey {

public:

    PrivateKey();
	virtual ~PrivateKey();

	// for debug
	void initForDebug_decimal(std::string &strE, std::string &strP, std::string &strQ);

	// for debug
	void printDebug();

	// Signature is created using RSA-PSS as described in PKCS# 1 v 2.1.
	void sign(std::vector<unsigned char> &input, HashType hashType, std::vector<unsigned char> &output);

	void decrypt(std::vector<unsigned char> &encrypted, std::vector<unsigned char> &output);

	std::shared_ptr<PublicKey> getPublicKey();

private:

	rsa_key key;

};

#endif //UNITOOLS_PRIVATEKEY_H
