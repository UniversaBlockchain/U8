/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UBool.h"

UBool::UBoolData::UBoolData(bool v)  {
    value = v;
}

bool UBool::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UBoolData>();
}

UBool &UBool::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UBoolData>())
        throw std::invalid_argument("object is not instance of UBool");

    return (UBool&)object;
}

const UBool &UBool::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UBoolData>())
        throw std::invalid_argument("object is not instance of UBool");

    return (const UBool&)object;
}


UBool::UBool(bool value) : UObject(std::make_shared<UBoolData>(value)) {

}

bool UBool::get() const {
    return data<UBoolData>().value;
}
