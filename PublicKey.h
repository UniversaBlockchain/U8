//
// Created by Leonid Novikov on 2018-12-11.
//

#ifndef UNITOOLS_PUBLICKEY_H
#define UNITOOLS_PUBLICKEY_H

#include <vector>
#include <tomcrypt.h>
#include <gmp.h>

class PublicKey {

public:

    enum HashType {
        SHA1
    };

    PublicKey();
    virtual ~PublicKey();

	void init(mpz_ptr N, mpz_ptr e);

	bool verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data, HashType hashType);

	void encrypt(std::vector<unsigned char>& input, std::vector<unsigned char>& output);

private:

	rsa_key key;

};


#endif //UNITOOLS_PUBLICKEY_H
