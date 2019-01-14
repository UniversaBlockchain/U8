//
// Created by Leonid Novikov on 2018-12-11.
//

#include <gmp.h>
#include <tomcrypt.h>
#include "PublicKey.h"

PublicKey::PublicKey() {
	memset(&key, 0, sizeof(key));
}

PublicKey::~PublicKey() {
	rsa_free(&key);
}

void PublicKey::init(mpz_ptr N, mpz_ptr e) {
	MP_INT zero;
	mpz_init_set_ui(&zero, 0);
	size_t bin_e_len = (mpz_sizeinbase(e, 2) + 7) / 8;
	size_t bin_N_len = (mpz_sizeinbase(N, 2) + 7) / 8;
	unsigned char bin_e[bin_e_len];
	unsigned char bin_N[bin_N_len];
	mpz_export(bin_e, NULL, 1, 1, 1, 0, e);
	mpz_export(bin_N, NULL, 1, 1, 1, 0, N);
	rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key);
	key.type = PK_PUBLIC;
	mpz_clear(&zero);
}


bool PublicKey::verify(const std::vector<unsigned char> &sig, const std::vector<unsigned char> &data, HashType hashType) {
	int mgf1hash_idx = getHashIndex(SHA1);
	int hash_idx = getHashIndex(hashType);
	auto desc = hash_descriptor[hash_idx];

	unsigned char hashResult[desc.hashsize];
	hash_state md;
	desc.init(&md);
	desc.process(&md, &data[0], data.size());
	desc.done(&md, hashResult);

	int saltLen = rsa_sign_saltlen_get_max_ex(LTC_PKCS_1_PSS, hash_idx, &key);

	int stat = -1;
	int err = rsa_verify_hash_ex(
			&sig[0], sig.size(),
			hashResult, desc.hashsize, hash_idx,
			LTC_PKCS_1_PSS, mgf1hash_idx, saltLen, &stat, &key);
	if (err != CRYPT_OK)
		printf("  warning (rsa_verify_hash_ex): %s\n", error_to_string(err));
	return stat != 0;
}

void PublicKey::encrypt(std::vector<unsigned char>& input, std::vector<unsigned char>& output) {
	int hash_idx = find_hash("sha1");
	int prng_indx = find_prng("sprng");

	size_t bufLen = 512;
	unsigned char buf[bufLen];

	int err = rsa_encrypt_key_ex(
		&input[0], input.size(),
		buf, &bufLen,
		NULL, 0,
		NULL, prng_indx,
		hash_idx, LTC_PKCS_1_OAEP, &key);
	if (err != CRYPT_OK)
		printf("rsa_encrypt_key_ex error: %i\n", err);

	output.resize(0);
	output.insert(output.begin(), buf, buf+bufLen);
}
