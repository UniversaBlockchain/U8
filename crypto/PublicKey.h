//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PUBLICKEY_H
#define UNITOOLS_PUBLICKEY_H

#include <vector>
#include <tomcrypt.h>
#include <gmp.h>
#include <unordered_map>
#include <memory>
#include "cryptoCommonPrivate.h"
#include "KeyAddress.h"
#include "PrivateKey.h"
#include "../types/UBytes.h"

class PublicKey {

public:

	PublicKey(mpz_ptr N, mpz_ptr e);
	PublicKey(const std::string& strE, const std::string& strN);
	PublicKey(const UBytes& e, const UBytes& N);
	PublicKey(const std::vector<unsigned char>& packedBinaryKey);
	PublicKey(const PrivateKey& privateKey);

	std::vector<unsigned char> pack() const;

	bool verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data, HashType hashType);
	void encrypt(std::vector<unsigned char>& input, std::vector<unsigned char>& output);

	const KeyAddress& getShortAddress();
	const KeyAddress& getLongAddress();

	void toHash(std::unordered_map<std::string, std::string>& dst) const;
	long getPublicExponent() const;
	int getBitStrength() const;
	void getKeyComponentsAsBytes(std::vector<unsigned char>& output) const;

private:

	void initFromBytes(const UBytes& eValue, const UBytes& nValue);
	void initFromDecimalStrings(const std::string& strE, const std::string& strN);

private:

	RsaKeyWrapper key;
	HashType mgf1HashType = DEFAULT_MGF1_HASH;

	KeyAddress shortAddress;
	KeyAddress longAddress;

};


#endif //UNITOOLS_PUBLICKEY_H
