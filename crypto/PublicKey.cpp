/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#define USE_GMP 1
#define GMP_DESC 1

#include <gmp.h>
#include <tomcrypt.h>
#include "KeyAddress.h"
#include "PublicKey.h"
#include "cryptoCommonPrivate.h"
#include "../types/UBytes.h"
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

namespace crypto {

	PublicKey::PublicKey(mpz_ptr N, mpz_ptr e) {
		size_t bin_e_len = mpz_unsigned_bin_size(e);
		size_t bin_N_len = mpz_unsigned_bin_size(N);
		unsigned char bin_e[bin_e_len];
		unsigned char bin_N[bin_N_len];
		mpz_to_unsigned_bin(e, bin_e);
		mpz_to_unsigned_bin(N, bin_N);
		rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key.key);
		key.key.type = PK_PUBLIC;
	}

	PublicKey::PublicKey(const std::string &strE, const std::string &strN) {
		initFromDecimalStrings(strE, strN);
	}

	PublicKey::PublicKey(const std::vector<unsigned char> &packedBinaryKey) :
			PublicKey((void *) &packedBinaryKey[0], packedBinaryKey.size()) {
	}

	PublicKey::PublicKey(void *packedBinaryKeyData, size_t packedBinaryKeySize) {
		try {
			UBytes uBytes((unsigned char *) packedBinaryKeyData, packedBinaryKeySize);
			BossSerializer::Reader reader(uBytes);
			UObject uObj = reader.readObject();
			auto uArr = UArray::asInstance(uObj);
			auto uInt = UInt::asInstance(uArr.at(0));
			if (uInt.get() == 0) {
				throw std::runtime_error("the key is private, not public");
			} else if (uInt.get() == 1) {
				auto e = UBytes::asInstance(uArr.at(1));
				auto n = UBytes::asInstance(uArr.at(2));
				initFromBytes(e, n);
			} else if (uInt.get() == 2) {
				throw std::runtime_error("key is password protected");
			} else {
				throw std::runtime_error("Bad or unknown public key type");
			}
		} catch (const std::exception &e) {
			throw std::runtime_error(std::string("failed to parse public key: ") + std::string(e.what()));
		}
	}

	PublicKey::PublicKey(const PrivateKey &privateKey) : PublicKey((mpz_ptr) privateKey.key.key.N,
																   (mpz_ptr) privateKey.key.key.e) {
	}

	void PublicKey::initFromBytes(const UBytes &eValue, const UBytes &nValue) {
		MP_INT e, n;
		mpz_init(&e);
		mpz_init(&n);
		mpz_import(&e, eValue.get().size(), 1, 1, 0, 0, eValue.get().data());
		mpz_import(&n, nValue.get().size(), 1, 1, 0, 0, nValue.get().data());
		size_t bin_e_len = mpz_unsigned_bin_size(&e);
		size_t bin_N_len = mpz_unsigned_bin_size(&n);
		unsigned char bin_e[bin_e_len];
		unsigned char bin_N[bin_N_len];
		mpz_to_unsigned_bin(&e, bin_e);
		mpz_to_unsigned_bin(&n, bin_N);
		rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key.key);
		key.key.type = PK_PUBLIC;
		mpz_clear(&e);
		mpz_clear(&n);
	}

	void PublicKey::initFromDecimalStrings(const std::string &strE, const std::string &strN) {
		mpz_t e;
		mpz_t n;
		mpz_init(e);
		mpz_init(n);
		gmp_sscanf(strE.c_str(), "%Zd", e);
		gmp_sscanf(strN.c_str(), "%Zd", n);
		size_t bin_e_len = mpz_unsigned_bin_size(e);
		size_t bin_N_len = mpz_unsigned_bin_size(n);
		unsigned char bin_e[bin_e_len];
		unsigned char bin_N[bin_N_len];
		mpz_to_unsigned_bin(e, bin_e);
		mpz_to_unsigned_bin(n, bin_N);
		rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key.key);
		key.key.type = PK_PUBLIC;
		mpz_clear(e);
		mpz_clear(n);
	}

	std::vector<unsigned char> PublicKey::pack() const {
		size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr) key.key.e);
		unsigned char bin_e[bin_e_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.e, bin_e);
		size_t bin_N_len = mpz_unsigned_bin_size((mpz_ptr) key.key.N);
		unsigned char bin_N[bin_N_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.N, bin_N);

		auto ub = UBytes(bin_e, bin_e_len);

		UArray ua = {
				UInt(1),
				UBytes(bin_e, bin_e_len),
				UBytes(bin_N, bin_N_len)
		};

		BossSerializer::Writer writer;
		writer.writeObject(ua);
		auto bb = writer.getBytes();
		auto bbp = bb.get();
		std::vector<unsigned char> output(bbp.size());
		memcpy(&output[0], bbp.data(), bbp.size());
		return output;
	}

	bool PublicKey::verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data,
						   HashType hashType) const {
		return verify((void *) &sig[0], sig.size(), (void *) &data[0], data.size(), hashType);
	}

	bool PublicKey::verify(void *sigData, size_t sigSize, void *bodyData, size_t bodySize, HashType hashType) const {
		int mgf1hash_idx = getHashIndex(SHA1);
		int hash_idx = getHashIndex(hashType);
		auto desc = hash_descriptor[hash_idx];

		unsigned char hashResult[desc.hashsize];
		hash_state md;
		desc.init(&md);
		desc.process(&md, (unsigned char *) bodyData, bodySize);
		desc.done(&md, hashResult);

		int saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key.key);

		int stat = -1;
		int err = rsa_verify_hash_ex(
				(unsigned char *) sigData, sigSize,
				hashResult, desc.hashsize, hash_idx,
				LTC_PKCS_1_PSS, mgf1hash_idx, saltLen, &stat, &key.key);
//	if (err != CRYPT_OK)
//		printf("  warning (rsa_verify_hash_ex): %s\n", error_to_string(err));
		return stat != 0;
	}

	void PublicKey::encrypt(const std::vector<unsigned char> &input, std::vector<unsigned char> &output) const {
		output.resize(0);
		auto a = encrypt(input);
		output.insert(output.begin(), a.begin(), a.end());
	}

	std::vector<unsigned char> PublicKey::encrypt(const std::vector<unsigned char> &input) const {
		return encrypt((void *) &input[0], input.size());
	}

	std::vector<unsigned char> PublicKey::encrypt(void *data, size_t size) const {
		int hash_idx = find_hash("sha1");
		int prng_indx = find_prng("sprng");

		size_t bufLen = 512;
		unsigned char buf[bufLen];

		int err = rsa_encrypt_key_ex(
				(unsigned char *) data, size,
				buf, &bufLen,
				NULL, 0,
				NULL, prng_indx,
				hash_idx, LTC_PKCS_1_OAEP, &key.key);
		if (err != CRYPT_OK)
			printf("rsa_encrypt_key_ex error: %i\n", err);

		std::vector<unsigned char> output;
		output.insert(output.begin(), buf, buf + bufLen);
		return output;
	}

	const KeyAddress &PublicKey::getShortAddress() {
		if (!shortAddress.isInitialized())
			shortAddress = KeyAddress(*this, 0, false);
		return shortAddress;
	}

	const KeyAddress &PublicKey::getLongAddress() {
		if (!longAddress.isInitialized())
			longAddress = KeyAddress(*this, 0, true);
		return longAddress;
	}

	bool PublicKey::isMatchingKeyAddress(const KeyAddress &other) {
		return other.isLong() ? getLongAddress().isMatchingKeyAddress(other) : getShortAddress().isMatchingKeyAddress(
				other);
	}

	std::vector<unsigned char> PublicKey::fingerprint() {
		if (fingerprint_.empty()) {
			fingerprint_.resize(33);
			fingerprint_[0] = FINGERPRINT_SHA256;
			auto keyComponents = getKeyComponentsAsBytes();
			auto digest = Digest(HashType::SHA256, keyComponents).getDigest();
			memcpy(&fingerprint_[1], &digest[0], 32);
		}
		return fingerprint_;
	}

	void PublicKey::toHash(std::unordered_map<std::string, std::string> &dst) const {
		char buf[2048];
		gmp_snprintf(buf, sizeof(buf) / sizeof(buf[0]), "%Zx", key.key.N);
		dst["n"] = std::string(buf);
		gmp_snprintf(buf, sizeof(buf) / sizeof(buf[0]), "%Zx", key.key.e);
		dst["e"] = std::string(buf);

		// Optional fields.
		if (mgf1HashType != DEFAULT_MGF1_HASH)
			dst["mgf1Hash"] = std::string(getJavaHashName(mgf1HashType));
	}

	long PublicKey::getPublicExponent() const {
		size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr) key.key.e);
		unsigned char bin_e[bin_e_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.e, bin_e);
		long e = 0;
		for (int i = 0; i < bin_e_len; ++i)
			e = (e << 8) | bin_e[i];
		return e;
	}

	int PublicKey::getBitStrength() const {
		int modulus_bitlen = ltc_mp.count_bits(key.key.N);
		return modulus_bitlen;
	}

	std::vector<unsigned char> PublicKey::getKeyComponentsAsBytes() const {
		std::vector<unsigned char> output;
		int len1 = mpz_unsigned_bin_size((mpz_ptr) key.key.e);
		int len2 = mpz_unsigned_bin_size((mpz_ptr) key.key.N);
		output.resize(len1 + len2);
		mpz_to_unsigned_bin((mpz_ptr) key.key.e, &output[0]);
		mpz_to_unsigned_bin((mpz_ptr) key.key.N, &output[len1]);
		return output;
	}

};