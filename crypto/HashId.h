//
// Created by Leonid Novikov on 2018-12-27.
//

#ifndef UNITOOLS_HASHID_H
#define UNITOOLS_HASHID_H

#include <vector>
#include <string>
#include <memory>

class HashId {

public:
    HashId(const std::vector<unsigned char>& packedData);
    HashId(void* data, size_t size);
    HashId(const HashId& copyFrom);
    static HashId of(const std::vector<unsigned char>& packedData);
    static HashId of(void* data, size_t size);

    void initWith(const std::vector<unsigned char>& packedData);
    void initWith(void* data, size_t size);
    std::string toBase64();
    std::vector<unsigned char> getDigest();

    bool operator<(const HashId& other) const;
    bool operator==(const HashId& other) const;
    size_t hashCode() const;

public:
    struct UnorderedHash {
        size_t operator()(const HashId& val) const;
    };

protected:
    std::vector<unsigned char> digest;

};

#endif //UNITOOLS_HASHID_H
