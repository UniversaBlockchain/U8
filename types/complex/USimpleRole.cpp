//
// Created by flint on 7/30/19.
//

#include "USimpleRole.h"
#include "../../serialization/BossSerializer.h"
#include "../UBytes.h"
#include "../UString.h"
#include "../UArray.h"

USimpleRole::USimpleRoleData::USimpleRoleData() {
}

USimpleRole::USimpleRoleData::USimpleRoleData(const SimpleRole &val) {
    simpleRole = val;
}

USimpleRole::USimpleRole(): UObject(std::make_shared<USimpleRoleData>()) {
}

USimpleRole::USimpleRole(const SimpleRole &val): UObject(std::make_shared<USimpleRoleData>(val)) {
}

bool USimpleRole::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<USimpleRoleData>();
}

USimpleRole& USimpleRole::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<USimpleRoleData>())
        throw std::invalid_argument("object is not instance of USimpleRole");

    return (USimpleRole&) object;
}

const USimpleRole& USimpleRole::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<USimpleRoleData>())
        throw std::invalid_argument("object is not instance of USimpleRole");

    return (const USimpleRole&) object;
}

UBinder USimpleRole::decompose() {
    UBinder b = UBinder::of("name", UString(getSimpleRole().name));
    if (getSimpleRole().comment != "")
        b.set("comment", getSimpleRole().comment);

    //TODO: requiredAllConstraints, requiredAnyConstraints
    //...

    //TODO: keyAddresses, keyRecords
    //...

    return b;
}

void USimpleRole::compose(const UBinder& data) {
    SimpleRole role;
    role.name = data.getString("name");
    role.comment = data.getStringOrDefault("comment", "");

    //TODO: requiredAllConstraints, requiredAnyConstraints
    //...

    //TODO: keyAddresses, keyRecords
    //...

    this->data<USimpleRoleData>().simpleRole = role;
}

SimpleRole& USimpleRole::getSimpleRole() {
    return data<USimpleRoleData>().simpleRole;
}
