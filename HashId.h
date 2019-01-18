//
// Created by Leonid Novikov on 2018-12-27.
//

#ifndef UNITOOLS_HASHID_H
#define UNITOOLS_HASHID_H

#include <vector>
#include <string>
#include <memory>
#include <bits/shared_ptr.h>

class HashId {

public:
    HashId(const std::vector<unsigned char> &packedData);
    static std::shared_ptr<HashId> of(const std::vector<unsigned char> &packedData);

    void initWith(const std::vector<unsigned char> &packedData);
    std::string toBase64();

protected:
    std::vector<unsigned char> digest;

//private:

};

#endif //UNITOOLS_HASHID_H
