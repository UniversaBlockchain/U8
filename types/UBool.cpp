//
// Created by Roman Uskov on 2018-12-17.
//

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
