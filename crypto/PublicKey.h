/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_PUBLICKEY_H
#define UNITOOLS_PUBLICKEY_H

#include <vector>
#undef NORETURN // shut NORETURN redefinition warning in tomcrypt.h
#include <tomcrypt.h>
#include <gmp.h>
#include <unordered_map>
#include <memory>
#include "cryptoCommonPrivate.h"
#include "KeyAddress.h"
#include "PrivateKey.h"
#include "../types/UBytes.h"

namespace crypto {

	class PublicKey {

	public:

		PublicKey(mpz_ptr N, mpz_ptr e);

		PublicKey(const std::string &strE, const std::string &strN);

		PublicKey(const std::vector<unsigned char> &packedBinaryKey);

		PublicKey(void *packedBinaryKeyData, size_t packedBinaryKeySize);

		PublicKey(const PrivateKey &privateKey);

		std::vector<unsigned char> pack() const;

		bool verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data, HashType hashType) const;

		bool verify(void *sigData, size_t sigSize, void *bodyData, size_t bodySize, HashType hashType) const;
		bool verifyEx(void *sigData, size_t sigSize, void *bodyData, size_t bodySize, HashType pssHashType, HashType mgf1HashType, int saltLen = -1) const;

		void encrypt(const std::vector<unsigned char> &input, std::vector<unsigned char> &output) const;

		std::vector<unsigned char> encrypt(const std::vector<unsigned char> &input) const;

		std::vector<unsigned char> encrypt(void *data, size_t size) const;

		std::vector<unsigned char> encryptEx(void *input_data, size_t input_size, int oaepHashType) const;
		std::vector<unsigned char> encryptExWithSeed(void *input_data, size_t input_size, int oaepHashType, void *seed_data, size_t seed_size) const;

		const KeyAddress &getShortAddress();

		const KeyAddress &getLongAddress();

		bool isMatchingKeyAddress(const KeyAddress &other);

		std::vector<unsigned char> fingerprint();

		void toHash(std::unordered_map<std::string, std::string> &dst) const;

		long getPublicExponent() const;

		int getBitStrength() const;

		std::vector<unsigned char> getKeyComponentsAsBytes() const;

		std::string get_e() const;
		std::string get_n() const;

	private:

		void initFromBytes(const UBytes &eValue, const UBytes &nValue);

		void initFromDecimalStrings(const std::string &strE, const std::string &strN);

	private:

		const static char FINGERPRINT_SHA256 = 7;

		RsaKeyWrapper key;
		HashType mgf1HashType = DEFAULT_MGF1_HASH;

		KeyAddress shortAddress;
		KeyAddress longAddress;
		std::vector<unsigned char> fingerprint_;

	};

};

#endif //UNITOOLS_PUBLICKEY_H
