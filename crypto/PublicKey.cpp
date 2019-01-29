//
// Created by Leonid Novikov on 2018-12-11.
//

#define USE_GMP 1
#define GMP_DESC 1

#include <gmp.h>
#include <tomcrypt.h>
#include "KeyAddress.h"
#include "PublicKey.h"
#include "../types/UBytes.h"
#include "../types/UArray.h"
#include "../serialization/BossSerializer.h"

PublicKey::PublicKey(mpz_ptr N, mpz_ptr e) {
	memset(&key, 0, sizeof(key));
	size_t bin_e_len = mpz_unsigned_bin_size(e);
	size_t bin_N_len = mpz_unsigned_bin_size(N);
	unsigned char bin_e[bin_e_len];
	unsigned char bin_N[bin_N_len];
	mpz_to_unsigned_bin(e, bin_e);
	mpz_to_unsigned_bin(N, bin_N);
	rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key);
	key.type = PK_PUBLIC;
}

PublicKey::PublicKey(const std::string& strE, const std::string& strN) {
	memset(&key, 0, sizeof(key));
	initFromDecimalStrings(strE, strN);
}

PublicKey::PublicKey(const UBytes& e, const UBytes& N) {
	memset(&key, 0, sizeof(key));
	initFromBytes(e, N);
}

PublicKey::PublicKey(const std::vector<unsigned char>& packedBinaryKey) {
	memset(&key, 0, sizeof(key));
	try {
		UBytes uBytes(&packedBinaryKey[0], packedBinaryKey.size());
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
	} catch (const std::exception& e) {
		throw std::runtime_error(std::string("failed to parse public key: ") + std::string(e.what()));
	}
}

PublicKey::PublicKey(const PrivateKey& privateKey): PublicKey((mpz_ptr)privateKey.key.N, (mpz_ptr)privateKey.key.e) {
}

PublicKey::~PublicKey() {
	rsa_free(&key);
}

void PublicKey::initFromBytes(const UBytes& eValue, const UBytes& nValue) {
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
	rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key);
	key.type = PK_PUBLIC;
	mpz_clear(&e);
	mpz_clear(&n);
}

void PublicKey::initFromDecimalStrings(const std::string& strE, const std::string& strN) {
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
	rsa_set_key(bin_N, bin_N_len, bin_e, bin_e_len, NULL, 0, &key);
	key.type = PK_PUBLIC;
	mpz_clear(e);
	mpz_clear(n);
}

std::vector<unsigned char> PublicKey::pack() const {
	size_t bin_e_len = mpz_unsigned_bin_size((mpz_ptr)key.e);
	unsigned char bin_e[bin_e_len];
	mpz_to_unsigned_bin((mpz_ptr)key.e, bin_e);
	size_t bin_N_len = mpz_unsigned_bin_size((mpz_ptr)key.N);
	unsigned char bin_N[bin_N_len];
	mpz_to_unsigned_bin((mpz_ptr)key.N, bin_N);

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

const std::unique_ptr<KeyAddress>& PublicKey::getShortAddress() {
	if (shortAddress == nullptr)
		shortAddress = std::make_unique<KeyAddress>(*this, 0, false);
	return shortAddress;
}

const std::unique_ptr<KeyAddress>& PublicKey::getLongAddress() {
	if (longAddress == nullptr)
		longAddress = std::make_unique<KeyAddress>(*this, 0, true);
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
