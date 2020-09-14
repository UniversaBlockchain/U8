/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <gmp.h>
#include "base64.h"
#include "PrivateKey.h"
#include "PublicKey.h"
#include "cryptoCommonPrivate.h"
#include "no_prng.h"
#include "KeyInfo.h"
#include "../types/UBytes.h"
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

namespace crypto {

	PrivateKey::PrivateKey(const std::string &strE, const std::string &strP, const std::string &strQ) {
		initFromDecimalStrings(strE, strP, strQ);
	}

	PrivateKey::PrivateKey(const UBytes &eValue, const UBytes &pValue, const UBytes &qValue) {
		initFromBytes(eValue, pValue, qValue);
	}

	PrivateKey::PrivateKey(const std::vector<unsigned char> &packedBinaryKey) :
			PrivateKey((void *) &packedBinaryKey[0], packedBinaryKey.size()) {
	}

	PrivateKey::PrivateKey(void *packedBinaryKeyData, size_t packedBinaryKeySize) {
		try {
			UBytes uBytes((unsigned char *) packedBinaryKeyData, packedBinaryKeySize);
			BossSerializer::Reader reader(uBytes);
			UObject uObj = reader.readObject();
			auto uArr = UArray::asInstance(uObj);
			auto uInt = UInt::asInstance(uArr.at(0));
			if (uInt.get() == 0) {
				auto e = UBytes::asInstance(uArr.at(1));
				auto p = UBytes::asInstance(uArr.at(2));
				auto q = UBytes::asInstance(uArr.at(3));
				initFromBytes(e, p, q);
			} else if (uInt.get() == 1) {
				throw std::runtime_error("the key is public, not private");
			} else if (uInt.get() == 2) {
				throw std::runtime_error("key is password protected");
			} else {
				throw std::runtime_error("Bad or unknown private key type");
			}
		} catch (const std::exception &e) {
			throw std::runtime_error(std::string("failed to parse private key: ") + std::string(e.what()));
		}
	}

	PrivateKey::PrivateKey(int bitStrength) {
		generate(bitStrength);
	}

	void PrivateKey::initFromBytes(const UBytes &eValue, const UBytes &pValue, const UBytes &qValue) {
		MP_INT e, p, q;
		mpz_init(&e);
		mpz_init(&p);
		mpz_init(&q);
		mpz_import(&e, eValue.get().size(), 1, 1, 0, 0, eValue.get().data());
		mpz_import(&p, pValue.get().size(), 1, 1, 0, 0, pValue.get().data());
		mpz_import(&q, qValue.get().size(), 1, 1, 0, 0, qValue.get().data());
		char str_e[2048];
		char str_p[2048];
		char str_q[2048];
		gmp_snprintf(str_e, sizeof(str_e) / sizeof(str_e[0]), "%Zd", &e);
		gmp_snprintf(str_p, sizeof(str_p) / sizeof(str_p[0]), "%Zd", &p);
		gmp_snprintf(str_q, sizeof(str_q) / sizeof(str_q[0]), "%Zd", &q);
		mpz_clear(&e);
		mpz_clear(&p);
		mpz_clear(&q);
		initFromDecimalStrings(std::string(str_e), std::string(str_p), std::string(str_q));
	}

	void PrivateKey::initFromDecimalStrings(const std::string &strE, const std::string &strP, const std::string &strQ) {
		int err = -1;
		MP_INT e, d, N, dQ, dP, qP, p, q;
		MP_INT t1, t2, t3, one;

		mpz_init_set_ui(&one, 1);
		mpz_init(&e);
		mpz_init(&d);
		mpz_init(&N);
		mpz_init(&dQ);
		mpz_init(&dP);
		mpz_init(&qP);
		mpz_init(&p);
		mpz_init(&q);
		mpz_init(&t1);
		mpz_init(&t2);
		mpz_init(&t3);

		mpz_set_str(&e, strE.c_str(), 10);
		mpz_set_str(&p, strP.c_str(), 10);
		mpz_set_str(&q, strQ.c_str(), 10);

		mpz_mul(&N, &p, &q);

		mpz_sub(&t1, &p, &one);
		mpz_sub(&t2, &q, &one);
		mpz_mul(&t3, &t1, &t2);
		mpz_invert(&d, &e, &t3);

		mpz_mod(&dP, &d, &t1);

		mpz_mod(&dQ, &d, &t2);

		mpz_invert(&qP, &q, &p);

		size_t bin_e_len = mpz_unsigned_bin_size(&e);
		size_t bin_d_len = mpz_unsigned_bin_size(&d);
		size_t bin_N_len = mpz_unsigned_bin_size(&N);
		size_t bin_p_len = mpz_unsigned_bin_size(&p);
		size_t bin_q_len = mpz_unsigned_bin_size(&q);
		size_t bin_dp_len = mpz_unsigned_bin_size(&dP);
		size_t bin_dq_len = mpz_unsigned_bin_size(&dQ);
		size_t bin_qp_len = mpz_unsigned_bin_size(&qP);
		unsigned char bin_e[bin_e_len];
		unsigned char bin_d[bin_d_len];
		unsigned char bin_N[bin_N_len];
		unsigned char bin_p[bin_p_len];
		unsigned char bin_q[bin_q_len];
		unsigned char bin_dp[bin_dp_len];
		unsigned char bin_dq[bin_dq_len];
		unsigned char bin_qp[bin_qp_len];
		mpz_to_unsigned_bin(&e, bin_e);
		mpz_to_unsigned_bin(&d, bin_d);
		mpz_to_unsigned_bin(&N, bin_N);
		mpz_to_unsigned_bin(&p, bin_p);
		mpz_to_unsigned_bin(&q, bin_q);
		mpz_to_unsigned_bin(&dP, bin_dp);
		mpz_to_unsigned_bin(&dQ, bin_dq);
		mpz_to_unsigned_bin(&qP, bin_qp);

		if ((err = rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, bin_d, bin_d_len, &key.key)) != CRYPT_OK)
			printf("rsa_set_key error: %i\n", err);

		if ((err = rsa_set_factors(bin_p, bin_p_len, bin_q, bin_q_len, &key.key)) != CRYPT_OK)
			printf("rsa_set_factors error: %i\n", err);

		if ((err = rsa_set_crt_params(bin_dp, bin_dp_len, bin_dq, bin_dq_len, bin_qp, bin_qp_len, &key.key)) !=
			CRYPT_OK)
			printf("rsa_set_crt_params error: %i\n", err);

		key.key.type = PK_PRIVATE;

		mpz_clear(&one);
		mpz_clear(&e);
		mpz_clear(&d);
		mpz_clear(&N);
		mpz_clear(&dQ);
		mpz_clear(&dP);
		mpz_clear(&qP);
		mpz_clear(&p);
		mpz_clear(&q);
		mpz_clear(&t1);
		mpz_clear(&t2);
		mpz_clear(&t3);
	}

	void PrivateKey::generate(int bitStrength) {
		int err;
		long default_e = 65537l;
//	int default_certainty = 20;
//	HashType default_mgf1_hash = HashType::SHA1;
//	HashType default_oaep_hash = HashType::SHA1;

		if ((err = rsa_make_key(NULL, find_prng("sprng"), bitStrength / 8, default_e, &key.key)) != CRYPT_OK) {
			throw std::runtime_error(
					std::string("generate new private key error: ") + std::string(error_to_string(err)));
		}

	}

	std::vector<unsigned char> PrivateKey::pack() const {
		size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr) key.key.e);
		unsigned char bin_e[bin_e_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.e, bin_e);
		size_t bin_p_len = mpz_unsigned_bin_size((mpz_ptr) key.key.p);
		unsigned char bin_p[bin_p_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.p, bin_p);
		size_t bin_q_len = mpz_unsigned_bin_size((mpz_ptr) key.key.q);
		unsigned char bin_q[bin_q_len];
		mpz_to_unsigned_bin((mpz_ptr) key.key.q, bin_q);

		auto ub = UBytes(bin_e, bin_e_len);

		UArray ua = {
				UInt(0),
				UBytes(bin_e, bin_e_len),
				UBytes(bin_p, bin_p_len),
				UBytes(bin_q, bin_q_len)
		};

		BossSerializer::Writer writer;
		writer.writeObject(ua);

		auto bb = writer.getBytes();
		auto bbp = bb.get();
		std::vector<unsigned char> output(bbp.size());
		memcpy(&output[0], bbp.data(), bbp.size());
		return output;
	}

	std::vector<unsigned char> PrivateKey::packWithPassword(const std::string& passwordString, int rounds) const {
		KeyInfo::PRF prf = KeyInfo::PRF::HMAC_SHA256;

		byte_vector salt(12);
		sprng_read(&salt[0], salt.size(), nullptr);

		KeyInfo keyInfo(prf, rounds, salt, nullptr);
		crypto::SymmetricKey symmKey = keyInfo.derivePassword(passwordString);

		byte_vector packedKey = pack();

		UArray uArray;
		uArray.push_back(UInt(3)); // TYPE_PRIVATE_PASSWORD_V2
		uArray.push_back(UBytes(keyInfo.pack()));
		uArray.push_back(UBytes(symmKey.etaEncrypt(packedKey)));

		BossSerializer::Writer w;
		w.writeObject(uArray);

		return w.getBytes().get();
	}

	PrivateKey PrivateKey::unpackWithPassword(const byte_vector& packedBinary, const std::string& passwordString) {
		byte_vector bv = packedBinary;
		UBytes uBytes(std::move(bv));
		BossSerializer::Reader reader(uBytes);
		UObject uObj = reader.readObject();
		UArray params = UArray::asInstance(uObj);
		auto keyType = UInt::asInstance(params.at(0)).get();
		if (keyType == 0) { // TYPE_PRIVATE
			return PrivateKey(packedBinary);
		} else if (keyType == 1) { // TYPE_PUBLIC
			throw std::runtime_error("unpackWithPassword: the key is public, not private");
		} else if (keyType == 2) { // TYPE_PRIVATE_PASSWORD
			int rounds = (int)UInt::asInstance(params.at(1)).get();
			byte_vector salt = UBytes::asInstance(params.at(2)).get();
			std::string functionName = UString::asInstance(params.at(3)).get();
			byte_vector packedEncryptedKey = UBytes::asInstance(params.at(4)).get();
			byte_vector digest = UBytes::asInstance(params.at(5)).get();
			crypto::SymmetricKey symmKey = KeyInfo(KeyInfo::PRFFromName(functionName), rounds, salt, nullptr).derivePassword(passwordString);
			byte_vector packedKey = symmKey.decrypt(packedEncryptedKey);

			crc32_state crcs;
			crc32_init(&crcs);
			crc32_update(&crcs, &packedKey[0], packedKey.size());
			byte_vector resDigest(4);
			crc32_finish(&crcs, &resDigest[0], resDigest.size());
			if (digest != resDigest)
				throw std::invalid_argument("unpackWithPassword: wrong password");

			return PrivateKey(packedKey);
		} else if (keyType == 3) { // TYPE_PRIVATE_PASSWORD_V2
			byte_vector keyInfoBin = UBytes::asInstance(params.at(1)).get();
			byte_vector encryptedBin = UBytes::asInstance(params.at(2)).get();
			KeyInfo keyInfo(keyInfoBin);
			crypto::SymmetricKey symmKey = keyInfo.derivePassword(passwordString);
			byte_vector packedKey = symmKey.etaDecrypt(encryptedBin);
			return PrivateKey(packedKey);
		} else {
			throw std::runtime_error("unpackWithPassword: Bad or unknown private key type");
		}
	}

	void
	PrivateKey::sign(const std::vector<unsigned char> &input, HashType hashType, std::vector<unsigned char> &output) const {
		output.resize(0);
		auto a = sign(input, hashType);
		output.insert(output.begin(), a.begin(), a.end());
	}

	std::vector<unsigned char> PrivateKey::sign(const std::vector<unsigned char> &input, HashType hashType) const {
		return sign((void *) &input[0], input.size(), hashType);
	}

	std::vector<unsigned char> PrivateKey::sign(void *data, size_t size, HashType hashType) const {
		int mgf1hash_idx = getHashIndex(SHA1);
		int hash_idx = getHashIndex(hashType);
		auto desc = getHashDescriptor(hashType);
		int prng_indx = find_prng("sprng");

		unsigned char hashResult[desc.hashsize];
		hash_state md;
		desc.init(&md);
		desc.process(&md, (unsigned char *) data, size);
		desc.done(&md, hashResult);

		int saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key.key);

		unsigned long tomSigLen = 1024;
		unsigned char tomSig[tomSigLen];
		int res = rsa_sign_hash_ex(
				hashResult, desc.hashsize, hash_idx,
				tomSig, &tomSigLen,
				LTC_PKCS_1_PSS, NULL, prng_indx, mgf1hash_idx, saltLen, &key.key);
		if (res != CRYPT_OK)
			printf("rsa_sign_hash_ex error: %i\n", res);

		std::vector<unsigned char> output;
		output.insert(output.begin(), tomSig, tomSig + tomSigLen);
		return output;
	}

	std::vector<unsigned char> PrivateKey::signEx(const std::vector<unsigned char> &input, HashType hashType, HashType mgf1HashType, int saltLen) const {
		return signEx((void *) &input[0], input.size(), hashType, mgf1HashType, saltLen);
	}

	std::vector<unsigned char> PrivateKey::signEx(void *data, size_t size, HashType hashType, HashType mgf1HashType, int saltLen) const {
		int mgf1hash_idx = getHashIndex(mgf1HashType);
		int hash_idx = getHashIndex(hashType);
		auto desc = getHashDescriptor(hashType);
		int prng_indx = find_prng("sprng");

		unsigned char hashResult[desc.hashsize];
		hash_state md;
		desc.init(&md);
		desc.process(&md, (unsigned char *) data, size);
		desc.done(&md, hashResult);

		if (saltLen == -1)
			saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key.key);

		unsigned long tomSigLen = 1024;
		unsigned char tomSig[tomSigLen];
		int res = rsa_sign_hash_ex(
				hashResult, desc.hashsize, hash_idx,
				tomSig, &tomSigLen,
				LTC_PKCS_1_PSS, NULL, prng_indx, mgf1hash_idx, saltLen, &key.key);
		if (res != CRYPT_OK)
			printf("rsa_sign_hash_ex error: %i\n", res);

		std::vector<unsigned char> output;
		output.insert(output.begin(), tomSig, tomSig + tomSigLen);
		return output;
	}

	std::vector<unsigned char> PrivateKey::signExWithCustomSalt(void *data, size_t size, HashType hashType, HashType mgf1HashType, void *saltData, size_t saltSize) const {
		ltc_prng_descriptor* no_prng_desc = no_prng_desc_get();
		int mgf1hash_idx = getHashIndex(mgf1HashType);
		int hash_idx = getHashIndex(hashType);
		auto desc = getHashDescriptor(hashType);
		int prng_indx = register_prng(no_prng_desc);

		unsigned char hashResult[desc.hashsize];
		hash_state md;
		desc.init(&md);
		desc.process(&md, (unsigned char *) data, size);
		desc.done(&md, hashResult);

		if (saltSize > 0)
			prng_descriptor[prng_indx].add_entropy((unsigned char *) saltData, saltSize, (prng_state*)no_prng_desc);

		int saltLen = (int) saltSize;

		unsigned long tomSigLen = 1024;
		unsigned char tomSig[tomSigLen];
		int res = rsa_sign_hash_ex(
				hashResult, desc.hashsize, hash_idx,
				tomSig, &tomSigLen,
				LTC_PKCS_1_PSS, (prng_state*)no_prng_desc, prng_indx, mgf1hash_idx, saltLen, &key.key);
		if (res != CRYPT_OK)
			printf("rsa_sign_hash_ex error: %i\n", res);

		std::vector<unsigned char> output;
		output.insert(output.begin(), tomSig, tomSig + tomSigLen);

		unregister_prng(no_prng_desc);
		no_prng_desc_free(no_prng_desc);

		return output;
	}

	void PrivateKey::decrypt(const std::vector<unsigned char> &encrypted, std::vector<unsigned char> &output) {
		output.resize(0);
		auto a = decrypt(encrypted);
		output.insert(output.begin(), a.begin(), a.end());
	}

	std::vector<unsigned char> PrivateKey::decrypt(const std::vector<unsigned char> &encrypted) {
		return decrypt((void *) &encrypted[0], encrypted.size());
	}

	std::vector<unsigned char> PrivateKey::decrypt(void *data, size_t size) {
		int hash_idx = find_hash("sha1");

		size_t bufLen = 1024;
		unsigned char buf[bufLen];

		int stat = -1;
		int err = rsa_decrypt_key_ex(
				(unsigned char *) data, size,
				buf, &bufLen,
				NULL, 0,
				hash_idx, LTC_PKCS_1_OAEP, &stat, &key.key);
		if (err != CRYPT_OK)
			throw std::runtime_error(std::string("rsa_decrypt_key_ex error: ") + std::string(error_to_string(err)));

		std::vector<unsigned char> output;
		output.insert(output.begin(), buf, buf + bufLen);
		return output;
	}

	std::string PrivateKey::get_e() const {
		byte_vector bv(2048);
		zeromem(&bv[0], bv.size());
		gmp_snprintf((char*)&bv[0], bv.size(), "%Zx", key.key.e);
		return std::string((char*)&bv[0]);
	}

	std::string PrivateKey::get_p() const {
		byte_vector bv(2048);
		zeromem(&bv[0], bv.size());
		gmp_snprintf((char*)&bv[0], bv.size(), "%Zx", key.key.p);
		return std::string((char*)&bv[0]);
	}

	std::string PrivateKey::get_q() const {
		byte_vector bv(2048);
		zeromem(&bv[0], bv.size());
		gmp_snprintf((char*)&bv[0], bv.size(), "%Zx", key.key.q);
		return std::string((char*)&bv[0]);
	}

};