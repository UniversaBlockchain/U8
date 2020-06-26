/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "U8Module.h"
#include "../tools/tools.h"
#include "../u8core.u8m.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"
#include "../types/UBinder.h"
#include "../serialization/BossSerializer.h"
#include "../crypto/base64.h"

using namespace crypto;

const char *U8_PUBLIC_KEY = "HggcAQABxAABuc8tZdvfwUY550JXjg6GkVszQsy5lrao6LX5BpmVCPRq8xBlhqNnZmPz+sv+bFlGHPhydqV1xkSzBxGi+JqPYE+q0NQ9MJ3YVOzd/MRVW+dn7oZ8uUcWp81j/Wmn4mGVHP9bFhaqiu1JpnkJS6We5923IMrGrhxHDdstFFbs0KVHfgX1ekKKZSkXqNOHFb1VcvIyHrWyL4ZBqVlhqoQB7uMz68MlVznCzdF1HVWtwfuTLzVKXLlMNXGRYLaMqsBKH2U9esN6wXbvSfiMRRKKyiHMfYO4Ohg8ZAnnOfUwCqR48LbxY/W6w0aJ+uy4ohA9jKbT+JEp+vv3bM3KV8jt1w==";
extern const char *U8COREMODULE_NAME;
extern const char *U8COREMODULE_FULLNAME;

U8Module::U8Module(const std::string& modulePath, const std::string &homeDir) {
    this->modulePath = modulePath;
    this->homeDir = homeDir;
}

bool U8Module::load() {
    try {
        int err = 0;

        byte_vector u8coreBin;
        zip* z = nullptr;
        if (modulePath.find(U8COREMODULE_FULLNAME) != std::string::npos) {
            struct zip_error error = {0};
            zip_source_t *zsrc = zip_source_buffer_create(u8core_u8m, u8core_u8m_len, 0, &error);
            if (zsrc == nullptr) {
                printf("error: zip_source_filep_create\n");
                return false;
            }
            z = zip_open_from_source(zsrc, 0, &error);
            if (error.zip_err != 0) {
                printf("zip_open_from_source error code: %i\n", error.zip_err);
                return false;
            }
        } else {
            z = zip_open(modulePath.c_str(), 0, &err);
        }

        if (z == nullptr) {
            printf("File %s not found\n", modulePath.c_str());
            return false;
        }

        zip_get_archive_comment(z, &lenSignData, ZIP_FL_ENC_RAW);

        manifest = loadManifest(z);
        name = (manifest.find("name") != manifest.end()) ? manifest.find("name")->second : modulePath;

        zip_close(z);
        return true;

    } catch (const std::exception& e) {
        printf("Error loading module: %s\n", e.what());
        return false;
    }
}

bool U8Module::checkModuleSignature() {
    try {
        if (lenSignData == 0) {
            printf("Signature of module %s not found\n", modulePath.c_str());
            return false;
        }
        if (lenSignData > 65536) {
            printf("Signature of module %s has wrong format\n", modulePath.c_str());
            return false;
        }

        FILE* f = nullptr;
        if (modulePath.find(U8COREMODULE_FULLNAME) != std::string::npos) {
            f = fmemopen(u8core_u8m, u8core_u8m_len, "r+b");
        } else {
            f = fopen(modulePath.c_str(), "rb");
        }
        if (f == nullptr) {
            printf("Failed opening file %s\n", modulePath.c_str());
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
        if (!checkKeyTrust(key)) {
            printf("Untrusted signature key\n");
            res = false;
        }

        delete publicKey;

        fclose(f);

        free(data);
        free(signData);

        if (!initRequireRoots()) {
            printf("jslib in u8 core module not found\n");
            res = false;
        }

        return res;

    } catch (const std::exception& e) {
        printf("Error checking module signature: %s\n", e.what());
        return false;
    }
}

static char path_separator = '/';

bool U8Module::initRequireRoots() {

    bool isU8Core = name == U8COREMODULE_NAME;

    if (!isU8Core)
        require_roots.push_back(modulePath);

    std::string path = modulePath + path_separator + "jslib";
    if (file_exists(path, true))
        require_roots.push_back(path);
    else if (isU8Core)
        return false;

    return true;
}

bool U8Module::checkKeyTrust(std::vector<unsigned char> &keyData) {

    auto U8Key = base64_decodeToBytes(U8_PUBLIC_KEY);
    if (keyData.size() == U8Key.size() && memcmp(keyData.data(), U8Key.data(), U8Key.size()) == 0)
        return true;

    // for U8 core module - only hardcoded key trust
    if (name == U8COREMODULE_NAME)
        return false;

    YAML::Node trust;
    YAML::iterator moduleTrust;
    std::string path = "u8trust.yaml";
    bool checkU8trust = true;
    bool trustChanged = false;
    bool foundedModuleTrust = false;

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
        if (trust["trust_all"].IsMap() && trust["trust_all"]["addresses"].IsSequence())
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

        // check for module
        if (trust["trust_modules"].IsSequence())
            for (auto it = trust["trust_modules"].begin(); it != trust["trust_modules"].end(); it++)
                if (it->IsMap() && (*it)["module_names"].IsSequence()) {
                    bool bModuleFound = false;
                    for (auto itn = (*it)["module_names"].begin(); itn != (*it)["module_names"].end(); itn++)
                        if (name == (*itn).as<std::string>()) {
                            bModuleFound = true;
                            break;
                        }

                    if (bModuleFound) {
                        if (!foundedModuleTrust && (*it)["module_names"].size() == 1) {
                            moduleTrust = it;
                            foundedModuleTrust = true;
                        }

                        // check trusted keys
                        if ((*it)["keys"].IsSequence())
                            for (auto itk = (*it)["keys"].begin(); itk != (*it)["keys"].end(); itk++) {
                                auto str = (*itk).as<std::string>();
                                str.erase(std::remove(str.begin(), str.end(), ' '), str.end());
                                auto trustedKey = base64_decodeToBytes(str);
                                if (keyData.size() == trustedKey.size() && memcmp(keyData.data(), trustedKey.data(), trustedKey.size()) == 0)
                                    return true;
                            }

                        // check trusted addresses
                        if ((*it)["addresses"].IsSequence())
                            for (auto ita = (*it)["addresses"].begin(); ita != (*it)["addresses"].end(); ita++) {
                                auto str = (*ita).as<std::string>();
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
                }

        // TODO: check trusted UNS
    }

    // TODO: scan trust addresses in module`s UNS conract

    auto ka = new KeyAddress(*publicKey, 0, true);

    // ask for trust for module key
    printf("Module \"%s\" is untrusted.\nModule has signed by key with address: %s.\nTrust this key? (y/n)",
           name.data(), ka->toString().data());
    std::string ans;
    getline(cin, ans);

    if (ans[0] == 'y' || ans[0] == 'Y') {
        printf("Trust this key for ALL modules? (y/n)");
        std::string ansAll;
        getline(cin, ansAll);

        if (ansAll[0] == 'y' || ansAll[0] == 'Y') {
            // add address to u8trust for all modules
            trust["trust_all"]["addresses"].push_back(ka->toString());

            printf("Address %s has added to u8trust for all modules.\n", ka->toString().data());
        } else {
            // add address to u8trust for module
            if (!foundedModuleTrust) {
                auto newModuleTrust = new YAML::Node();
                (*newModuleTrust)["module_names"].push_back(name);
                (*newModuleTrust)["addresses"].push_back(ka->toString());

                trust["trust_modules"].push_back(*newModuleTrust);
            }

            (*moduleTrust)["addresses"].push_back(ka->toString());

            printf("Address %s has added to u8trust for module \"%s\".\n", ka->toString().data(), name.data());
        }

        trustChanged = true;
    }

    delete ka;
    delete publicKey;

    if (trustChanged) {
        sortYAML(trust);
        std::ofstream fout(path);
        fout << trust;
        fout.close();
    }

    return trustChanged;
}

std::map<std::string, std::string> U8Module::loadManifest(zip* module) {
    std::map<std::string, std::string> manifest;

    struct zip_stat zbuffer;
    zip_stat_init(&zbuffer);
    int exist = zip_stat(module, "manifest.yaml", 0, &zbuffer);
    if (exist == -1)
        return manifest;

    char* contents = new char[zbuffer.size + 1];

    // read manifest from zip-module
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

std::string U8Module::getName() {
    return name;
}

std::string U8Module::resolveRequiredFile(const std::string &fileName) {
    if (fileName[0] == '.' || fileName[0] == path_separator) {
        // no, direct path
        return fileName;
    } else {
        // yes, we should try...
        for (const string &r: require_roots) {
            string fn = r + path_separator + fileName;
            if (file_exists(fn))
                return fn;
        }
    }
    return "";
}