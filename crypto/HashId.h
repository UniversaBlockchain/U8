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
    HashId(const HashId& copyFrom);
    static std::shared_ptr<HashId> of(const std::vector<unsigned char>& packedData);

    void initWith(const std::vector<unsigned char>& packedData);
    std::string toBase64();

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
