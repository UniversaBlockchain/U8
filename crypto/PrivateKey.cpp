//
// Created by Leonid Novikov on 2018-12-11.
//

#include <gmp.h>
#include "base64.h"
#include "PrivateKey.h"
#include "PublicKey.h"
#include "../types/UBytes.h"
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

PrivateKey::PrivateKey(const std::string& strE, const std::string& strP, const std::string& strQ) {
	memset(&key, 0, sizeof(key));
	initFromDecimalStrings(strE, strP, strQ);
}

PrivateKey::PrivateKey(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue) {
	memset(&key, 0, sizeof(key));
	initFromBytes(eValue, pValue, qValue);
}

PrivateKey::PrivateKey(const std::vector<unsigned char>& packedBinaryKey) {
	memset(&key, 0, sizeof(key));
	try {
		UBytes uBytes(&packedBinaryKey[0], packedBinaryKey.size());
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
	} catch (const std::exception& e) {
		throw std::runtime_error(std::string("failed to parse private key: ") + std::string(e.what()));
	}
}

PrivateKey::PrivateKey(const PrivateKey& copyFrom) {
	unsigned long sz = 4*1024;
	unsigned char buf[4*1024];
	rsa_export(buf, &sz, copyFrom.key.type, &copyFrom.key);
	if (sz > sizeof(buf))
		throw std::runtime_error(std::string("rsa_export error: output buffer too small"));
	rsa_import(buf, sz, &key);
}

PrivateKey::~PrivateKey() {
	rsa_free(&key);
}

void PrivateKey::initFromBytes(const UBytes& eValue, const UBytes& pValue, const UBytes& qValue) {
	MP_INT e, p, q;
	mpz_init(&e);
	mpz_init(&p);
	mpz_init(&q);
	mpz_import(&e, eValue.get().second, 1, 1, 0, 0, eValue.get().first);
	mpz_import(&p, pValue.get().second, 1, 1, 0, 0, pValue.get().first);
	mpz_import(&q, qValue.get().second, 1, 1, 0, 0, qValue.get().first);
	char str_e[2048];
	char str_p[2048];
	char str_q[2048];
	gmp_snprintf(str_e, sizeof(str_e)/sizeof(str_e[0]), "%Zd", &e);
	gmp_snprintf(str_p, sizeof(str_p)/sizeof(str_p[0]), "%Zd", &p);
	gmp_snprintf(str_q, sizeof(str_q)/sizeof(str_q[0]), "%Zd", &q);
	mpz_clear(&e);
	mpz_clear(&p);
	mpz_clear(&q);
	initFromDecimalStrings(std::string(str_e), std::string(str_p), std::string(str_q));
}

void PrivateKey::initFromDecimalStrings(const std::string& strE, const std::string& strP, const std::string& strQ) {
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

	if ((err = rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, bin_d, bin_d_len, &key)) != CRYPT_OK)
		printf("rsa_set_key error: %i\n", err);

	if ((err = rsa_set_factors(bin_p, bin_p_len, bin_q, bin_q_len, &key)) != CRYPT_OK)
		printf("rsa_set_factors error: %i\n", err);

	if ((err = rsa_set_crt_params(bin_dp, bin_dp_len, bin_dq, bin_dq_len, bin_qp, bin_qp_len, &key)) != CRYPT_OK)
		printf("rsa_set_crt_params error: %i\n", err);

    key.type = PK_PRIVATE;

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

std::vector<unsigned char> PrivateKey::pack() const {
	size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr)key.e);
	unsigned char bin_e[bin_e_len];
	mpz_to_unsigned_bin((mpz_ptr)key.e, bin_e);
	size_t bin_p_len = mpz_unsigned_bin_size((mpz_ptr)key.p);
	unsigned char bin_p[bin_p_len];
	mpz_to_unsigned_bin((mpz_ptr)key.p, bin_p);
	size_t bin_q_len = mpz_unsigned_bin_size((mpz_ptr)key.q);
	unsigned char bin_q[bin_q_len];
	mpz_to_unsigned_bin((mpz_ptr)key.q, bin_q);

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
	std::vector<unsigned char> output(bbp.second);
	memcpy(&output[0], bbp.first, bbp.second);
	return output;
}

void PrivateKey::sign(std::vector<unsigned char> &input, HashType hashType, std::vector<unsigned char> &output) {
	int mgf1hash_idx = getHashIndex(SHA1);
	int hash_idx = getHashIndex(hashType);
	auto desc = getHashDescriptor(hashType);
	int prng_indx = find_prng("sprng");

	unsigned char hashResult[desc.hashsize];
	hash_state md;
	desc.init(&md);
	desc.process(&md, &input[0], input.size());
	desc.done(&md, hashResult);

	int saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key);

	unsigned long tomSigLen = 512;
	unsigned char tomSig[tomSigLen];
	int res = rsa_sign_hash_ex(
			hashResult, desc.hashsize, hash_idx,
			tomSig, &tomSigLen,
			LTC_PKCS_1_PSS, NULL, prng_indx, mgf1hash_idx, saltLen, &key);
	if (res != CRYPT_OK)
		printf("rsa_sign_hash_ex error: %i\n", res);

	output.resize(0);
	output.insert(output.begin(), tomSig, tomSig+tomSigLen);
}

void PrivateKey::decrypt(std::vector<unsigned char> &encrypted, std::vector<unsigned char> &output) {
	int hash_idx = find_hash("sha1");

	size_t bufLen = 512;
	unsigned char buf[bufLen];

	int stat = -1;
	int err = rsa_decrypt_key_ex(
		&encrypted[0], encrypted.size(),
		buf, &bufLen,
		NULL, 0,
		hash_idx, LTC_PKCS_1_OAEP, &stat, &key);
	if (err != CRYPT_OK)
		printf("rsa_decrypt_key_ex error: %i\n", err);

	output.resize(0);
	output.insert(output.begin(), buf, buf+bufLen);
}
