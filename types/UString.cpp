//
// Created by Roman Uskov on 2018-12-17.
//

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
