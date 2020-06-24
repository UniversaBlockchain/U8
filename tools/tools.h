/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_TOOLS_H
#define U8_TOOLS_H

#include <string>
#include <sys/stat.h>
#include <iterator>
#include <vector>
#include <map>
#include <iostream>
#include <chrono>
#include "yaml-cpp/yaml.h"

typedef std::vector<unsigned char> byte_vector;

inline std::string bytesToString(const byte_vector& bv) {
    return std::string(bv.begin(), bv.end());
}

inline byte_vector stringToBytes(const std::string& s) {
    return byte_vector(s.begin(), s.end());
}

bool file_exists(const std::string &name, bool dirInZip = false);

std::string replace_all(const std::string &src,
                               const std::string &what,
                               const std::string &to,
                               size_t from_pos = 0);

std::string loadFromZip(const std::string &zipName, const std::string &fileName);

std::string loadAsString(const std::string &fileName);

std::string loadAsStringOrThrow(const std::string &fileName);

int singModule(const std::string &moduleName, const std::string &keyFileName);

void sortYAML(YAML::Node &trust);

std::string makeAbsolutePath(const std::string& path);

class io_error : public std::runtime_error {
public:
    using runtime_error::runtime_error;
};

template <typename T>
std::ostream& operator<< (std::ostream& out, const std::vector<T>& v) {
    if ( !v.empty() ) {
        out << "[";
        std::copy (v.begin(), v.end(), std::ostream_iterator<T>(out, ", "));
        out << "\b\b]";
    }
    return out;
}

class Noncopyable {
public:
    Noncopyable() = default;
    ~Noncopyable() = default;

private:
    Noncopyable(const Noncopyable&) = delete;
    Noncopyable& operator=(const Noncopyable&) = delete;
};

class Nonmovable {
public:
    Nonmovable() = default;
    ~Nonmovable() = default;

private:
    Nonmovable(Nonmovable&&) = delete;
    Nonmovable& operator=(Nonmovable&&) = delete;
};

inline
int64_t getCurrentTimeMillis() {
    return std::chrono::time_point_cast<std::chrono::milliseconds>(std::chrono::system_clock::now()).time_since_epoch().count();
}

bool isFileExists(const std::string& fileName);
std::string getFileContents(const std::string& fileName);
byte_vector getFileContentsBin(const std::string& fileName);
bool putFileContents(const std::string& fileName, const std::string& text);
bool putFileContentsBin(const std::string& fileName, const byte_vector& bin);

#endif //U8_TOOLS_H
