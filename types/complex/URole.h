//
// Created by flint on 8/2/19.
//

#ifndef U8_UROLE_H
#define U8_UROLE_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../universa_core/Roles.h"

class URole: public UObject {
protected:
    class URoleData : public UData {
    public:
        URoleData() = default;
        ~URoleData() override = default;

        virtual Role& getRole() = 0;
        virtual std::shared_ptr<Role> makeRoleSharedPtr() = 0;
    };

public:
    URole(std::shared_ptr<URoleData> d);

    static bool isInstance(const UObject& object);
    static URole& asInstance(UObject& object);
    static const URole& asInstance(const UObject& object);

    virtual UBinder decompose();
    virtual void compose(const UBinder& data);

    Role& getRole();
    std::shared_ptr<Role> makeRoleSharedPtr();
};

#endif //U8_UROLE_H
