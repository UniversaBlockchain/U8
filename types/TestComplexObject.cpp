/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "TestComplexObject.h"

TestComplexObject::UTestComplexObjectData::UTestComplexObjectData()
:  name(""), amount(0) {
}

TestComplexObject::UTestComplexObjectData::UTestComplexObjectData(const std::string& name, int64_t amount)
:  name(name), amount(amount) {
}

TestComplexObject::TestComplexObject()
: UObject(std::make_shared<UTestComplexObjectData>()) {
}

TestComplexObject::TestComplexObject(const std::string& name, int64_t amount)
: UObject(std::make_shared<UTestComplexObjectData>(name, amount)) {
}

bool TestComplexObject::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UTestComplexObjectData>();
}

TestComplexObject& TestComplexObject::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UTestComplexObjectData>())
        throw std::invalid_argument("object is not instance of TestComplexObject");

    return (TestComplexObject&) object;
}

const TestComplexObject& TestComplexObject::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UTestComplexObjectData>())
        throw std::invalid_argument("object is not instance of TestComplexObject");

    return (const TestComplexObject&) object;
}

UBinder TestComplexObject::decompose() {
    return UBinder::of("name", data<UTestComplexObjectData>().name, "amount", data<UTestComplexObjectData>().amount);
}

void TestComplexObject::compose(const UBinder& data) {
    this->data<UTestComplexObjectData>().name = data.getString("name");
    this->data<UTestComplexObjectData>().amount = data.getInt("amount");
}

std::string TestComplexObject::getName() {
    return data<UTestComplexObjectData>().name;
}

int64_t TestComplexObject::getAmount() {
    return data<UTestComplexObjectData>().amount;
}