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
    static HashId of(const std::vector<unsigned char>& packedData);
    static HashId of(void* packedData, size_t packedDataSize);
    static HashId withDigest(const std::vector<unsigned char>& digestData);
    static HashId withDigest(void* digestData, size_t digestDataSize);

    HashId(const HashId& copyFrom);
    HashId(HashId&& moveFrom);

    std::string toBase64();
    std::vector<unsigned char> getDigest();

    bool operator<(const HashId& other) const;
    bool operator==(const HashId& other) const;
    size_t hashCode() const;

public:
    /**
     * Use it with unordered_map, e.g.:
     * unordered_map&lt;HashId, int, HashId::UnorderedHash&gt;
     */
    struct UnorderedHash {
        size_t operator()(const HashId& val) const;
    };

private:
    std::vector<unsigned char> digest;
    HashId() {}
    HashId(const std::vector<unsigned char>& packedData);
    HashId(void* data, size_t size);
    void initWith(void* data, size_t size);

};

#endif //UNITOOLS_HASHID_H
