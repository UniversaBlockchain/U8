//
// Created by flint on 7/30/19.
//

#ifndef U8_USIMPLEROLE_H
#define U8_USIMPLEROLE_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../universa_core/Roles.h"

class USimpleRole: public UObject {
private:
    class USimpleRoleData : public UData {
    public:
        USimpleRoleData();
        USimpleRoleData(const SimpleRole &val);
        ~USimpleRoleData() = default;

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
