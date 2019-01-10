//
// Created by Leonid Novikov on 2018-12-11.
//

#include <gmp.h>
//#include "base64.h"
#include "PrivateKey.h"
#include "PublicKey.h"

size_t mpz_unsigned_bin_size(mpz_ptr p) {
	return (mpz_sizeinbase(p, 2) + 7) / 8;
}

void mpz_to_unsigned_bin(mpz_ptr p, unsigned char* buf) {
	mpz_export(buf, NULL, 1, 1, 1, 0, p);
}

PrivateKey::PrivateKey() {
	memset(&key, 0, sizeof(key));
}

PrivateKey::~PrivateKey() {
	rsa_free(&key);
}

void PrivateKey::initForDebug_decimal(std::string &strE, std::string &strP, std::string &strQ) {
	printf("initForDebug_decimal()...\n");
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

	//printf("bin_qP: %s\n", base64_encode(bin_p, bin_p_len).c_str());
	printf("bin_qP zu: %zu\n", bin_qp_len);

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

	printf("initForDebug_decimal()... done!\n");
}

void PrivateKey::printDebug() {
	printf("printDebug()...\n");

	gmp_printf ("N: %Zd\n", key.N);
	gmp_printf ("d: %Zd\n", key.d);
	gmp_printf ("dP: %Zd\n", key.dP);
	gmp_printf ("dQ: %Zd\n", key.dQ);
	gmp_printf ("qP: %Zd\n", key.qP);
}

void PrivateKey::sign(std::vector<unsigned char> &input, PublicKey::HashType hashType, std::vector<unsigned char> &output) {
	int hash_idx = find_hash("sha1");
	int prng_indx = find_prng("sprng");

	unsigned char sha1Result[sha1_desc.hashsize];
	hash_state md;
	sha1_init(&md);
	sha1_process(&md, &input[0], input.size());
	sha1_done(&md, sha1Result);

	int saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key);

	unsigned long tomSigLen = 512;
	unsigned char tomSig[tomSigLen];
	int res = rsa_sign_hash_ex(
		sha1Result, sha1_desc.hashsize,
		tomSig, &tomSigLen,
		LTC_PKCS_1_PSS, NULL, prng_indx, hash_idx, saltLen, &key);
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

std::shared_ptr<PublicKey> PrivateKey::getPublicKey() {
	auto publicKey = std::make_shared<PublicKey>();
	publicKey->init((mpz_ptr)key.N, (mpz_ptr)key.e);
	return publicKey;
}
