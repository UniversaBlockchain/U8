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
#include "zip.h"
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

bool checkModuleSignature(const std::string &modulePath, const std::string &homeDir);

bool checkKeyTrust(std::vector<unsigned char> &keyData, const std::string &moduleName, const std::string &homeDir);

void sortYAML(YAML::Node &trust);

std::map<std::string, std::string> getModuleManifest(zip* module);

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
long getCurrentTimeMillis() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count();
}

#endif //U8_TOOLS_H
