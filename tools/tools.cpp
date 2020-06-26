/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <fstream>
#include <iostream>
#include <algorithm>
#include "tools.h"
#include "zip.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"
#include "../types/UBinder.h"
#include "../serialization/BossSerializer.h"
#include "resources.h"

#ifndef __APPLE__
#include <filesystem>
#endif

using namespace std;
using namespace crypto;

extern const char *U8MODULE_EXTENSION;
extern const char *U8COREMODULE_NAME;
extern const char *U8COREMODULE_FULLNAME;

bool file_exists(const std::string &name, bool dirInZip) {
    size_t pos = name.find(U8MODULE_EXTENSION);
    struct stat buffer;
    if (pos == std::string::npos)
        return (stat(name.c_str(), &buffer) == 0);
    else {
        string zipPath = name.substr(0, pos + 4);
        string path = name.substr(pos + 5);

        if (zipPath.find(U8COREMODULE_FULLNAME) == std::string::npos)
            if (stat(zipPath.c_str(), &buffer) != 0)
                return false;

        // find in zip-archive
        int err = 0;

        byte_vector u8coreBin;
        zip* z = nullptr;
        if (zipPath.find(U8COREMODULE_FULLNAME) != std::string::npos) {
            u8coreBin = getU8CoreU8M_binary();
            struct zip_error error = {0};
            zip_source_t *zsrc = zip_source_buffer_create(u8coreBin.data(), u8coreBin.size(), 0, &error);
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
            z = zip_open(zipPath.c_str(), 0, &err);
        }

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
    if (zipName.find(U8COREMODULE_FULLNAME) == std::string::npos)
        if (stat(zipName.c_str(), &buffer) != 0)
            return string();

    // find in zip-archive
    int err = 0;

    byte_vector u8coreBin;
    zip* z = nullptr;
    if (zipName.find(U8COREMODULE_FULLNAME) != std::string::npos) {
        u8coreBin = getU8CoreU8M_binary();
        struct zip_error error = {0};
        zip_source_t *zsrc = zip_source_buffer_create(u8coreBin.data(), u8coreBin.size(), 0, &error);
        if (zsrc == nullptr) {
            printf("error: zip_source_filep_create\n");
            return string();
        }
        z = zip_open_from_source(zsrc, 0, &error);
        if (error.zip_err != 0) {
            printf("zip_open_from_source error code: %i\n", error.zip_err);
            return string();
        }
    } else {
        z = zip_open(zipName.c_str(), 0, &err);
    }

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

void sortYAML(YAML::Node &trust) {
    auto trust_all = trust["trust_all"];
    auto trust_modules = trust["trust_modules"];

    trust.remove("trust_all");
    trust.remove("trust_modules");

    trust["trust_all"] = trust_all;
    trust["trust_modules"] = trust_modules;

    auto keys = trust["trust_all"]["keys"];
    auto addresses = trust["trust_all"]["addresses"];
    auto UNS_names = trust["trust_all"]["UNS_names"];

    trust["trust_all"].remove("keys");
    trust["trust_all"].remove("addresses");
    trust["trust_all"].remove("UNS_names");

    trust["trust_all"]["keys"] = keys;
    trust["trust_all"]["addresses"] = addresses;
    trust["trust_all"]["UNS_names"] = UNS_names;

    for (auto it = trust["trust_modules"].begin(); it != trust["trust_modules"].end(); it++) {
        auto it_modules = (*it)["module_names"];
        auto it_keys = (*it)["keys"];
        auto it_addresses = (*it)["addresses"];
        auto it_UNS_names = (*it)["UNS_names"];

        (*it).remove("module_names");
        (*it).remove("keys");
        (*it).remove("addresses");
        (*it).remove("UNS_names");

        (*it)["module_names"] = it_modules;
        (*it)["keys"] = it_keys;
        (*it)["addresses"] = it_addresses;
        (*it)["UNS_names"] = it_UNS_names;
    }
}

std::string makeAbsolutePath(const std::string& path) {
#ifndef __APPLE__
    return std::filesystem::absolute(std::filesystem::path(path));
#else
    const std::string relative_sym("./");
    const std::string root_sym("/");

    if (path.rfind(root_sym,0) != 0) {
        char buf[PATH_MAX];
        std::string cwd = getcwd(buf, PATH_MAX);
        return cwd + (path.rfind(relative_sym,0) == 0 ? path.substr (relative_sym.length()) : path);
    }

    return path;
#endif
}

bool isFileExists(const std::string& fileName) {
    std::ifstream in(fileName);
    return in.good();
}

std::string getFileContents(const std::string& fileName) {
    std::ifstream in(fileName, std::ios::in | std::ios::binary);
    if (in)
    {
        std::string contents;
        in.seekg(0, std::ios::end);
        contents.resize((size_t)in.tellg());
        in.seekg(0, std::ios::beg);
        in.read(&contents[0], contents.size());
        in.close();
        return(contents);
    }
    return "";
}

byte_vector getFileContentsBin(const std::string& fileName)
{
    std::ifstream in(fileName, std::ios::in | std::ios::binary);
    if (in)
    {
        byte_vector contents;
        in.seekg(0, std::ios::end);
        contents.resize((size_t)in.tellg());
        in.seekg(0, std::ios::beg);
        in.read((char*)&contents[0], contents.size());
        in.close();
        return(contents);
    }
    return byte_vector();
}

bool putFileContents(const std::string& fileName, const std::string& text) {
    std::ofstream out(fileName, std::ios::trunc);
    if (out) {
        out << text;
        out.close();
        return true;
    }
    return false;
}

bool putFileContentsBin(const std::string& fileName, const byte_vector& bin) {
    std::ofstream out(fileName, std::ios::trunc | std::ofstream::binary);
    if (out) {
        //out << bin;
        out.write((const char*)bin.data(), bin.size());
        out.close();
        return true;
    }
    return false;
}
