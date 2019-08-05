//
// Created by flint on 8/2/19.
//

#include "URole.h"
#include "../../serialization/BossSerializer.h"
#include "../UBytes.h"
#include "../UString.h"
#include "../UArray.h"

URole::URole(std::shared_ptr<URoleData> d): UObject(d) {
}

bool URole::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<URoleData>();
}

URole& URole::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<URoleData>())
        throw std::invalid_argument("object is not instance of URole");

    return (URole&) object;
}

const URole& URole::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<URoleData>())
        throw std::invalid_argument("object is not instance of URole");

    return (const URole&) object;
}

UBinder URole::decompose() {
    UBinder b;
    return b;
}

void URole::compose(const UBinder& data) {
    this->data<URoleData>().getRole().name = data.getString("name");
    this->data<URoleData>().getRole().comment = data.getStringOrDefault("comment", "");

    //TODO: requiredAllConstraints, requiredAnyConstraints
    //...
}

Role& URole::getRole() {
    return data<URoleData>().getRole();
}

std::shared_ptr<Role> URole::makeRoleSharedPtr() {
    return data<URoleData>().makeRoleSharedPtr();
}

Local<Object> URole::URoleData::serializeToV8(Isolate* isolate) {
    auto res = UData::serializeToV8(isolate);
    getRole().serializeToV8(isolate, res);
    return res;
}
