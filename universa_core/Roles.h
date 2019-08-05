//
// Created by flint on 7/30/19.
//

#ifndef U8_ROLES_H
#define U8_ROLES_H

#include <set>
#include <map>
#include <string>
#include "ISerializableV8.h"
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

class Role: public ISerializableV8 {
public:
    virtual ~Role() = default;
    std::string name;
    std::string comment;
    std::set<std::string> requiredAllConstraints;
    std::set<std::string> requiredAnyConstraints;
    Local<Object>& serializeToV8(Isolate* isolate, Local<Object>& dst) override {
        dst->Set(String::NewFromUtf8(isolate, "name"), String::NewFromUtf8(isolate, name.data()));
        dst->Set(String::NewFromUtf8(isolate, "comment"), String::NewFromUtf8(isolate, comment.data()));
        return dst;
    }
};

class ListRole: public Role {
public:
    std::string mode;
    std::set<std::shared_ptr<Role>> roles;
    int quorumSize = 0;
    Local<Object>& serializeToV8(Isolate* isolate, Local<Object>& dst) override {
        Role::serializeToV8(isolate, dst);
        dst->Set(String::NewFromUtf8(isolate, "mode"), String::NewFromUtf8(isolate, mode.data()));
        auto arrRoles = Array::New(isolate);
        for (auto& r : roles) {
            auto o = Object::New(isolate);
            arrRoles->Set(arrRoles->Length(), r->serializeToV8(isolate, o));
        }
        dst->Set(String::NewFromUtf8(isolate, "roles"), arrRoles);
        dst->Set(String::NewFromUtf8(isolate, "quorumSize"), Number::New(isolate, quorumSize));

        dst->Set(String::NewFromUtf8(isolate, "__eval_v8ser"), String::NewFromUtf8(isolate, "obj.__proto__ = roles.ListRole.prototype;"));

        return dst;
    }
};

class SimpleRole: public Role {
public:
    std::set<std::shared_ptr<crypto::KeyAddress>> keyAddresses;
    std::set<std::shared_ptr<KeyRecord>> keyRecords;
    Local<Object>& serializeToV8(Isolate* isolate, Local<Object>& dst) override {
        Role::serializeToV8(isolate, dst);
        //TODO: serialize keyAddresses, keyRecords

        dst->Set(String::NewFromUtf8(isolate, "__eval_v8ser"), String::NewFromUtf8(isolate, "obj.__proto__ = roles.SimpleRole.prototype;"));

        return dst;
    }
};

#endif //U8_ROLES_H
