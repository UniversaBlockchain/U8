/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <fstream>
#include <iostream>
#include "tools.h"
#include "zip.h"

using namespace std;

bool file_exists(const std::string &name, bool dirInZip) {
    size_t pos = name.find(".zip/");
    struct stat buffer;
    if (pos == std::string::npos)
        return (stat(name.c_str(), &buffer) == 0);
    else {
        std::string zipPath = name.substr(0, pos + 4);
        std::string path = name.substr(pos + 5);

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
        std::string zipPath = fileName.substr(0, pos + 4);
        std::string path = fileName.substr(pos + 5);

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
        std::string zipPath = fileName.substr(0, pos + 4);
        std::string path = fileName.substr(pos + 5);

        string res = loadFromZip(zipPath, path);
        if (res.empty())
            throw io_error("file not found: " + fileName);
        return res;
    }
}

