//
// Created by flint on 7/30/19.
//

#ifndef U8_ULISTROLE_H
#define U8_ULISTROLE_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../universa_core/Roles.h"

class UListRole: public UObject {
private:
    class UListRoleData : public UData {
    public:
        UListRoleData();
        UListRoleData(const ListRole &val);
        ~UListRoleData() = default;

        ListRole listRole;
    };

public:
    UListRole();
    UListRole(const ListRole &val);

    static bool isInstance(const UObject& object);
    static UListRole& asInstance(UObject& object);
    static const UListRole& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    ListRole& getListRole();
};

#endif //U8_ULISTROLE_H
