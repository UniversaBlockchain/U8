//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PUBLICKEY_H
#define UNITOOLS_PUBLICKEY_H

#include <vector>
#include <tomcrypt.h>
#include <gmp.h>
#include <unordered_map>
#include "cryptoCommon.h"

class PublicKey {

public:

    PublicKey();
    virtual ~PublicKey();

	void init(mpz_ptr N, mpz_ptr e);

	bool verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data, HashType hashType);
	void encrypt(std::vector<unsigned char>& input, std::vector<unsigned char>& output);

	void toHash(std::unordered_map<std::string, std::string>& dst) const;
	long getPublicExponent() const;
	int getBitStrength() const;
	void getKeyComponentsAsBytes(std::vector<unsigned char>& output) const;

private:

	rsa_key key;
	HashType mgf1HashType = DEFAULT_MGF1_HASH;

};


#endif //UNITOOLS_PUBLICKEY_H
