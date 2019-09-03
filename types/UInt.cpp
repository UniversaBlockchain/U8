/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UInt.h"

UInt::UIntData::UIntData(int64_t v)  {
    value = v;
}

bool UInt::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UIntData>();
}

UInt &UInt::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UIntData>())
        throw std::invalid_argument("object is not instance of UInt");

    return (UInt&)object;
}

const UInt &UInt::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UIntData>())
        throw std::invalid_argument("object is not instance of UInt");

    return (const UInt&)object;
}


UInt::UInt(int64_t value) : UObject(std::make_shared<UIntData>(value)) {

}

int64_t UInt::get() const {
    return data<UIntData>().value;
}
