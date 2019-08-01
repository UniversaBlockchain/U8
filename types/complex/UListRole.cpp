//
// Created by flint on 7/30/19.
//

#include "UListRole.h"
#include "../../serialization/BossSerializer.h"
#include "../UBytes.h"
#include "../UString.h"
#include "../UArray.h"

UListRole::UListRoleData::UListRoleData() {
}

UListRole::UListRoleData::UListRoleData(const ListRole &val) {
    listRole = val;
}

UListRole::UListRole(): URole(std::make_shared<UListRoleData>()) {
}

UListRole::UListRole(const ListRole &val): URole(std::make_shared<UListRoleData>(val)) {
}

bool UListRole::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UListRoleData>();
}

UListRole& UListRole::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UListRoleData>())
        throw std::invalid_argument("object is not instance of UListRole");

    return (UListRole&) object;
}

const UListRole& UListRole::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UListRoleData>())
        throw std::invalid_argument("object is not instance of UListRole");

    return (const UListRole&) object;
}

UBinder UListRole::decompose() {
    UBinder b = UBinder::of("name", UString(getListRole().name));
    if (getListRole().comment != "")
        b.set("comment", getListRole().comment);

    //TODO: requiredAllConstraints, requiredAnyConstraints
    //...

    b.set("quorumSize", getListRole().quorumSize);
    b.set("mode", getListRole().mode);

    //TODO: roles
    //...

    return b;
}

void UListRole::compose(const UBinder& data) {
    URole::compose(data);

    ListRole& role = getListRole();

    role.quorumSize = (int)data.getIntOrDefault("quorumSize", 0);
    role.mode = data.getStringOrDefault("mode", "");

    UObject rolesObj = BaseSerializer::deserialize(data.getArray("roles"));
    UArray rolesArr = UArray::asInstance(rolesObj);
    role.roles.clear();
    for (auto it = rolesArr.begin(), itEnd = rolesArr.end(); it != itEnd; ++it)
        role.roles.insert(URole::asInstance(*it).makeRoleSharedPtr());
}

ListRole& UListRole::getListRole() {
    return data<UListRoleData>().listRole;
}
