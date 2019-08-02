//
// Created by flint on 7/30/19.
//

#ifndef U8_ROLES_H
#define U8_ROLES_H

#include <set>
#include <map>
#include <string>
#include "KeyRecord.h"
#include "../tools/tools.h"
#include "../crypto/KeyAddress.h"

struct RequiredMode {
    static const std::string& ALL_OF() {static std::string val = "ALL_OF"; return val;}
    static const std::string& ANY_OF() {static std::string val = "ANY_OF"; return val;}
};

struct ListRoleMode {
    static const std::string& ALL() {static std::string val = "ALL"; return val;}
    static const std::string& ANY() {static std::string val = "ANY"; return val;}
    static const std::string& QUORUM() {static std::string val = "QUORUM"; return val;}
};

class Role {
public:
    virtual ~Role() = default;
    std::string name;
    std::string comment;
    std::set<std::string> requiredAllConstraints;
    std::set<std::string> requiredAnyConstraints;
};

class ListRole: public Role {
public:
    std::string mode;
    std::set<std::shared_ptr<Role>> roles;
    int quorumSize = 0;
};

class SimpleRole: public Role {
public:
    std::set<std::shared_ptr<crypto::KeyAddress>> keyAddresses;
    std::set<std::shared_ptr<KeyRecord>> keyRecords;
};

#endif //U8_ROLES_H
