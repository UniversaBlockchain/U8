/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UString.h"

UString::UStringData::UStringData(const std::string& v)  {
    value = v;
}

bool UString::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UStringData>();
}

UString &UString::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UStringData>())
        throw std::invalid_argument("object is not instance of UString");

    return (UString&)object;
}

const UString &UString::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UStringData>())
        throw std::invalid_argument("object is not instance of UString");

    return (const UString&)object;
}


UString::UString(const std::string& value) : UObject(std::make_shared<UStringData>(value)) {

}

const std::string& UString::get() const {
    return data<UStringData>().value;
}
