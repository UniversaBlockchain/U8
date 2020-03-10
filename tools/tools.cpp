/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <fstream>
#include <iostream>
#include "tools.h"
#include "zip.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"

using namespace std;
using namespace crypto;

bool file_exists(const std::string &name, bool dirInZip) {
    size_t pos = name.find(".zip/");
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
    size_t pos = fileName.find(".zip/");
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
    size_t pos = fileName.find(".zip/");
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
    int err = 0;
    zip* z = zip_open(moduleName.c_str(), 0, &err);
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
    FILE* f = fopen(keyFileName.c_str(), "rb");
    if (f == nullptr) {
        printf("Failed opening key file %s\n", moduleName.c_str());
        return false;
    }
    fseek(f, 0, SEEK_END);
    auto keyLen = (size_t) ftell(f);
    fseek(f, 0, SEEK_SET);

    void* keyData = malloc(keyLen);
    fread(keyData, 1, keyLen, f);
    fclose(f);

    // read data for signing
    f = fopen(moduleName.c_str(), "r+b");
    if (f == nullptr) {
        printf("Failed opening module file %s\n", moduleName.c_str());
        return false;
    }
    fseek(f, 0, SEEK_END);
    auto dataLen = (size_t) ftell(f) - 2;
    fseek(f, 0, SEEK_SET);

    void* data = malloc(dataLen);
    fread(data, 1, dataLen, f);

    auto key = new PrivateKey(keyData, keyLen);

    // sign module
    auto sign = key->sign(data, dataLen, HashType::SHA512);

    auto publicKey = new PublicKey(*key);
    auto packedKey = publicKey->pack();

    // write public key and signature to archive
    auto fullSize = sizeof(unsigned short) * 2 + packedKey.size() + sign.size();
    fwrite(&fullSize, 1, sizeof(unsigned short), f);

    auto size = (unsigned short) packedKey.size();
    fwrite(&size, 1, sizeof(unsigned short), f);
    fwrite(packedKey.data(), 1, packedKey.size(), f);

    size = (unsigned short) sign.size();
    fwrite(&size, 1, sizeof(unsigned short), f);
    fwrite(sign.data(), 1, sign.size(), f);

    fclose(f);

    free(data);
    free(keyData);

    printf("Module '%s' successfully signed with key '%s'\n", moduleName.c_str(), keyFileName.c_str());

    return 0;
}

bool checkModuleSignature(const std::string &moduleName) {
    int err = 0;
    zip* z = zip_open(moduleName.c_str(), 0, &err);
    if (z == nullptr) {
        printf("File %s not found\n", moduleName.c_str());
        return false;
    }

    int lenSignData = 0;
    zip_get_archive_comment(z, &lenSignData, ZIP_FL_ENC_RAW);
    zip_close(z);

    if (lenSignData == 0) {
        printf("Signature of module %s not found\n", moduleName.c_str());
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
        return false;
    }

    fseek(f, dataLen + sizeof(unsigned short), SEEK_SET);

    // read key
    unsigned short keySize = 0;
    readed = fread(&keySize, 1, sizeof(unsigned short), f);
    if (readed != sizeof(unsigned short)) {
        printf("Failed reading key data size\n");
        return false;
    }

    void* packedKey = malloc(keySize);
    readed = fread(packedKey, 1, keySize, f);
    if (readed != keySize) {
        printf("Failed reading key data \n");
        return false;
    }

    // read sign
    unsigned short signSize = 0;
    readed = fread(&signSize, 1, sizeof(unsigned short), f);
    if (readed != sizeof(unsigned short)) {
        printf("Failed reading sign size\n");
        return false;
    }

    void* sign = malloc(signSize);
    readed = fread(sign, 1, signSize, f);
    if (readed != signSize) {
        printf("Failed reading sign\n");
        return false;
    }

    auto publicKey = new PublicKey(packedKey, keySize);

    // verify signature
    bool res = publicKey->verify(sign, signSize, data, dataLen, HashType::SHA512);

    fclose(f);

    free(data);
    free(packedKey);
    free(sign);

    return res;
}
