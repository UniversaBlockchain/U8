/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <fstream>
#include <iostream>
#include <algorithm>
#include "yaml-cpp/yaml.h"
#include "tools.h"
#include "zip.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"
#include "../types/UBinder.h"
#include "../serialization/BossSerializer.h"
#include "../crypto/base64.h"

using namespace std;
using namespace crypto;

extern const char *U8MODULE_EXTENSION;
const char *U8_PUBLIC_KEY = "HggcAQABxAABuc8tZdvfwUY550JXjg6GkVszQsy5lrao6LX5BpmVCPRq8xBlhqNnZmPz+sv+bFlGHPhydqV1xkSzBxGi+JqPYE+q0NQ9MJ3YVOzd/MRVW+dn7oZ8uUcWp81j/Wmn4mGVHP9bFhaqiu1JpnkJS6We5923IMrGrhxHDdstFFbs0KVHfgX1ekKKZSkXqNOHFb1VcvIyHrWyL4ZBqVlhqoQB7uMz68MlVznCzdF1HVWtwfuTLzVKXLlMNXGRYLaMqsBKH2U9esN6wXbvSfiMRRKKyiHMfYO4Ohg8ZAnnOfUwCqR48LbxY/W6w0aJ+uy4ohA9jKbT+JEp+vv3bM3KV8jt1w==";

bool file_exists(const std::string &name, bool dirInZip) {
    size_t pos = name.find(U8MODULE_EXTENSION);
    struct stat buffer;
    if (pos == std::string::npos)
        return (stat(name.c_str(), &buffer) == 0);
    else {
        string zipPath = name.substr(0, pos + 4);
        string path = name.substr(pos + 5);

        if (stat(zipPath.c_str(), &buffer) != 0)
            return false;

        // find in zip-archive
        int err = 0;
        zip* z = zip_open(zipPath.c_str(), 0, &err);
        if (z == nullptr)
            return false;

        if (dirInZip)
            path += "/";

        struct zip_stat zbuffer;
        zip_stat_init(&zbuffer);
        int res = zip_stat(z, path.c_str(), 0, &zbuffer);

        zip_close(z);

        return (res != -1);
    }
}

string replace_all(const string &src, const string &what, const string &to, size_t from_pos) {
    auto pos = src.find(src, from_pos);
    if (pos != string::npos)
        return replace_all(src.substr(0, pos) + what + src.substr(pos + what.length()), what, to, pos);
    else
        return src;
}

string loadFromZip(const string &zipName, const string &fileName) {
    struct stat buffer;
    if (stat(zipName.c_str(), &buffer) != 0)
        return string();

    // find in zip-archive
    int err = 0;
    zip* z = zip_open(zipName.c_str(), 0, &err);
    if (z == nullptr)
        return string();

    struct zip_stat zbuffer;
    zip_stat_init(&zbuffer);
    int exist = zip_stat(z, fileName.c_str(), 0, &zbuffer);
    if (exist == -1)
        return string();

    char* contents = new char[zbuffer.size + 1];

    // read file from zip-archive
    zip_file* f = zip_fopen(z, fileName.c_str(), 0);
    zip_fread(f, contents, zbuffer.size);
    zip_fclose(f);

    contents[zbuffer.size] = '\0';
    string res = string(contents);

    zip_close(z);
    delete[] contents;

    return res;
}

string loadAsString(const string &fileName) {
    size_t pos = fileName.find(U8MODULE_EXTENSION);
    if (pos == std::string::npos) {
        ifstream ifs(fileName);
        return string((istreambuf_iterator<char>(ifs)), (istreambuf_iterator<char>()));
    } else {
        string zipPath = fileName.substr(0, pos + 4);
        string path = fileName.substr(pos + 5);

        return loadFromZip(zipPath, path);
    }
}

string loadAsStringOrThrow(const string &fileName) {
    size_t pos = fileName.find(U8MODULE_EXTENSION);
    if (pos == std::string::npos) {
        ifstream ifs(fileName, ios::in);
        if (!ifs)
            throw io_error("file not found: " + fileName);
        return string((istreambuf_iterator<char>(ifs)), (istreambuf_iterator<char>()));
    } else {
        string zipPath = fileName.substr(0, pos + 4);
        string path = fileName.substr(pos + 5);

        string res = loadFromZip(zipPath, path);
        if (res.empty())
            throw io_error("file not found: " + fileName);
        return res;
    }
}

int singModule(const std::string &moduleName, const std::string &keyFileName) {
    try {
        int err = 0;
        zip *z = zip_open(moduleName.c_str(), 0, &err);
        if (z == nullptr) {
            printf("File %s not found\n", moduleName.c_str());
            return 1;
        }

        // delete exist comment
        if (zip_set_archive_comment(z, nullptr, 0) != 0) {
            printf("Failed deleting archive comment\n");
            return 1;
        }

        zip_close(z);

        // read key
        FILE *f = fopen(keyFileName.c_str(), "rb");
        if (f == nullptr) {
            printf("Failed opening key file %s\n", keyFileName.c_str());
            return 1;
        }
        fseek(f, 0, SEEK_END);
        auto keyLen = (size_t) ftell(f);
        fseek(f, 0, SEEK_SET);

        void *keyData = malloc(keyLen);
        fread(keyData, 1, keyLen, f);
        fclose(f);

        // read data for signing
        f = fopen(moduleName.c_str(), "r+b");
        if (f == nullptr) {
            printf("Failed opening module file %s\n", moduleName.c_str());
            return 1;
        }
        fseek(f, 0, SEEK_END);
        auto dataLen = (size_t) ftell(f) - 2;
        fseek(f, 0, SEEK_SET);

        void *data = malloc(dataLen);
        fread(data, 1, dataLen, f);

        auto key = new PrivateKey(keyData, keyLen);

        // sign module
        auto sign = key->sign(data, dataLen, HashType::SHA3_512);

        auto publicKey = new PublicKey(*key);
        auto packedKey = publicKey->pack();

        // form signature
        UBytes keyBytes(packedKey.data(), (unsigned short) packedKey.size());
        UBytes signBytes(sign.data(), (unsigned short) sign.size());

        UBinder signature = UBinder::of("pub_key", keyBytes, "sha3_512", signBytes);

        UBytes packed = BossSerializer::serialize(signature);

        if (packed.get().size() > 65536) {
            printf("Packed signature size exceed 65536 bytes\n");
            return 1;
        }

        // write public key and signature to archive
        auto size = (unsigned short) packed.get().size();
        fwrite(&size, 1, sizeof(unsigned short), f);
        fwrite(packed.get().data(), 1, size, f);

        fclose(f);

        free(data);
        free(keyData);

    } catch (const std::exception& e) {
        printf("Error singing module: %s\n", e.what());
        return 1;
    }

    printf("Module '%s' successfully signed with key '%s'\n", moduleName.c_str(), keyFileName.c_str());

    return 0;
}

bool checkModuleSignature(const std::string &moduleName, const std::string &homeDir) {
    try {
        int err = 0;
        zip* z = zip_open(moduleName.c_str(), 0, &err);
        if (z == nullptr) {
            printf("File %s not found\n", moduleName.c_str());
            return false;
        }

        int lenSignData = 0;
        zip_get_archive_comment(z, &lenSignData, ZIP_FL_ENC_RAW);

//        std::map<std::string, std::string> manifest = getModuleManifest(z);
//
//        if (manifest.find("name") != manifest.end())
//            printf("MANIFEST: name = %s\n", manifest.find("name")->second.data());
//        else
//            printf("MANIFEST: name = UNDEFINED\n");
//
//        if (manifest.find("UNS_name") != manifest.end())
//            printf("MANIFEST: UNS_name = %s\n", manifest.find("UNS_name")->second.data());
//        else
//            printf("MANIFEST: UNS_name = UNDEFINED\n");

        zip_close(z);

        if (lenSignData == 0) {
            printf("Signature of module %s not found\n", moduleName.c_str());
            return false;
        }
        if (lenSignData > 65536) {
            printf("Signature of module %s has wrong format\n", moduleName.c_str());
            return false;
        }

        // read module
        FILE* f = fopen(moduleName.c_str(), "rb");
        if (f == nullptr) {
            printf("Failed opening file %s\n", moduleName.c_str());
            return false;
        }
        fseek(f, 0, SEEK_END);
        auto moduleLen = (size_t) ftell(f);
        fseek(f, 0, SEEK_SET);

        auto dataLen = moduleLen - lenSignData - sizeof(unsigned short);
        void* data = malloc(dataLen);
        auto readed = fread(data, 1, dataLen, f);
        if (readed != dataLen) {
            printf("Failed reading module data\n");

            fclose(f);
            free(data);
            return false;
        }

        fseek(f, dataLen + sizeof(unsigned short), SEEK_SET);

        // read signature
        void* signData = malloc((unsigned short) lenSignData);
        readed = fread(signData, 1, (unsigned short) lenSignData, f);
        if (readed != lenSignData) {
            printf("Failed reading signature\n");

            fclose(f);
            free(data);
            free(signData);
            return false;
        }

        // unpack signature
        UBytes packed((const unsigned char*) signData, (unsigned short) lenSignData);
        UObject signature = BossSerializer::deserialize(packed);

        auto key = UBytes::asInstance(UBinder::asInstance(signature).get("pub_key")).get();
        auto sign = UBytes::asInstance(UBinder::asInstance(signature).get("sha3_512")).get();

        auto publicKey = new PublicKey(key.data(), key.size());

        // verify signature
        bool res = publicKey->verify(sign.data(), sign.size(), data, dataLen, HashType::SHA3_512);

        // check public key
        if (!checkKeyTrust(key, moduleName, homeDir)) {
            printf("Untrusted signature key\n");
            res = false;
        }

        delete publicKey;

        fclose(f);

        free(data);
        free(signData);

        return res;

    } catch (const std::exception& e) {
        printf("Error checking module signature: %s\n", e.what());
        return false;
    }
}

bool checkKeyTrust(std::vector<unsigned char> &keyData, const std::string &moduleName, const std::string &homeDir) {

    auto U8Key = base64_decodeToBytes(U8_PUBLIC_KEY);
    if (keyData.size() == U8Key.size() && memcmp(keyData.data(), U8Key.data(), U8Key.size()) == 0)
        return true;

    YAML::Node trust;
    std::string path = "u8trust.yaml";
    bool checkU8trust = true;
    bool trustChanged = false;

    // search u8trust file
    if (file_exists(path))
        trust = YAML::LoadFile(path);
    else if (file_exists(path = homeDir + "/.universa/u8trust.yaml"))
        trust = YAML::LoadFile(path);
    else
        checkU8trust = false;

    auto publicKey = new PublicKey(keyData.data(), keyData.size());

    if (checkU8trust) {
        // check trusted keys
        if (trust["trust_all"].IsMap() && trust["trust_all"]["keys"].IsSequence())
            for (auto it = trust["trust_all"]["keys"].begin(); it != trust["trust_all"]["keys"].end(); it++) {
                auto str = (*it).as<std::string>();
                str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
                auto trustedKey = base64_decodeToBytes(str);
                if (keyData.size() == trustedKey.size() && memcmp(keyData.data(), trustedKey.data(), trustedKey.size()) == 0)
                    return true;
            }

        // check trusted addresses
        if (trust["trust_all"].IsMap() && trust["trust_all"]["addresses"].IsSequence()) {
            for (auto it = trust["trust_all"]["addresses"].begin(); it != trust["trust_all"]["addresses"].end(); it++) {
                auto str = (*it).as<std::string>();
                str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
                auto ka = new KeyAddress(str);
                bool res = ka->isMatchingKey(*publicKey);
                delete ka;

                if (res) {
                    delete publicKey;
                    return true;
                }
            }
        }

        // TODO: check trusted UNS (and keys/addresses for modules)
    }

    auto ka = new KeyAddress(*publicKey, 0, true);

    // ask for trust for module key
    printf("Module \"%s\" is untrusted.\nModule has signed by key with address: %s.\nTrust this key? (y/n)",
        moduleName.data(), ka->toString().data());
    char ans = (char) getchar();

    if (ans == 'y' || ans == 'Y') {
        // add address to u8trust
        trust["trust_all"]["addresses"].push_back(ka->toString());
        trustChanged = true;

        printf("Address %s has added to u8trust for all modules.\n", ka->toString().data());
    }

    delete ka;
    delete publicKey;

    if (trustChanged) {
        std::ofstream fout(path);
        fout << trust;
        fout.close();
    }

    return trustChanged;
}

std::map<std::string, std::string> getModuleManifest(zip* module) {
    std::map<std::string, std::string> manifest;

    struct zip_stat zbuffer;
    zip_stat_init(&zbuffer);
    int exist = zip_stat(module, "manifest.yaml", 0, &zbuffer);
    if (exist == -1)
        return manifest;

    char* contents = new char[zbuffer.size + 1];

    // read file from zip-archive
    zip_file* f = zip_fopen(module, "manifest.yaml", 0);
    zip_fread(f, contents, zbuffer.size);
    zip_fclose(f);

    contents[zbuffer.size] = '\0';

    YAML::Node manifestYaml = YAML::Load(contents);

    if (manifestYaml["name"])
        manifest.insert(std::pair<std::string, std::string>("name", manifestYaml["name"].as<std::string>()));

    if (manifestYaml["UNS_name"])
        manifest.insert(std::pair<std::string, std::string>("UNS_name", manifestYaml["UNS_name"].as<std::string>()));

    delete[] contents;

    return manifest;
}