//
// Created by flint on 7/30/19.
//

#ifndef U8_USIMPLEROLE_H
#define U8_USIMPLEROLE_H

#include "URole.h"
#include "../UObject.h"
#include "../UBinder.h"
#include "../../universa_core/Roles.h"
#include "../../universa_core/KeyRecord.h"

class USimpleRole: public URole {
private:
    class USimpleRoleData : public URoleData {
    public:
        USimpleRoleData();
        USimpleRoleData(const SimpleRole &val);
        ~USimpleRoleData() override = default;

        Role& getRole() override {return simpleRole;}
        std::shared_ptr<Role> makeRoleSharedPtr() override {return std::make_shared<SimpleRole>(simpleRole);}
        SimpleRole simpleRole;
    };

public:
    USimpleRole();
    USimpleRole(const SimpleRole &val);

    static bool isInstance(const UObject& object);
    static USimpleRole& asInstance(UObject& object);
    static const USimpleRole& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    SimpleRole& getSimpleRole();
};

#endif //U8_USIMPLEROLE_H
