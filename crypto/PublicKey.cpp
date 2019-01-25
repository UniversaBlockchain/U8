//
// Created by Leonid Novikov on 2018-12-11.
//

#define USE_GMP 1
#define GMP_DESC 1

#include <gmp.h>
#include <tomcrypt.h>
#include "KeyAddress.h"
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
	size_t bin_e_len = mpz_unsigned_bin_size(e);
	size_t bin_N_len = mpz_unsigned_bin_size(N);
	unsigned char bin_e[bin_e_len];
	unsigned char bin_N[bin_N_len];
	mpz_to_unsigned_bin(e, bin_e);
	mpz_to_unsigned_bin(N, bin_N);
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
//	if (err != CRYPT_OK)
//		printf("  warning (rsa_verify_hash_ex): %s\n", error_to_string(err));
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

std::shared_ptr<KeyAddress> PublicKey::getShortAddress() {
	if (shortAddress == nullptr)
		shortAddress = std::make_shared<KeyAddress>(*this, 0, false);
	return shortAddress;
}

std::shared_ptr<KeyAddress> PublicKey::getLongAddress() {
	if (longAddress == nullptr)
		longAddress = std::make_shared<KeyAddress>(*this, 0, true);
	return longAddress;
}

void PublicKey::toHash(std::unordered_map<std::string, std::string>& dst) const {
	char buf[2048];
	gmp_snprintf(buf, sizeof(buf)/sizeof(buf[0]), "%Zx", key.N);
	dst["n"] = std::string(buf);
	gmp_snprintf(buf, sizeof(buf)/sizeof(buf[0]), "%Zx", key.e);
	dst["e"] = std::string(buf);

	// Optional fields.
	if (mgf1HashType != DEFAULT_MGF1_HASH)
		dst["mgf1Hash"] = std::string(getJavaHashName(mgf1HashType));
}

long PublicKey::getPublicExponent() const {
	size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr)key.e);
	unsigned char bin_e[bin_e_len];
	mpz_to_unsigned_bin((mpz_ptr)key.e, bin_e);
	long e = 0;
	for (int i = 0; i < bin_e_len; ++i)
		e = (e << 8) | bin_e[i];
	return e;
}

int PublicKey::getBitStrength() const {
	int modulus_bitlen = ltc_mp.count_bits(key.N);
	return modulus_bitlen;
}

void PublicKey::getKeyComponentsAsBytes(std::vector<unsigned char>& output) const {
	int len1 = mpz_unsigned_bin_size((mpz_ptr)key.e);
	int len2 = mpz_unsigned_bin_size((mpz_ptr)key.N);
	output.resize(len1 + len2);
	mpz_to_unsigned_bin((mpz_ptr)key.e, &output[0]);
	mpz_to_unsigned_bin((mpz_ptr)key.N, &output[len1]);
}
