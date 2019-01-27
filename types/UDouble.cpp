//
// Created by Roman Uskov on 2018-12-17.
//

#include "UDouble.h"

UDouble::UDoubleData::UDoubleData(double v)  {
    value = v;
}

bool UDouble::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UDoubleData>();
}

UDouble &UDouble::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UDoubleData>())
        throw std::invalid_argument("object is not instance of UDouble");

    return (UDouble&)object;
}

const UDouble &UDouble::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UDoubleData>())
        throw std::invalid_argument("object is not instance of UDouble");

    return (const UDouble&)object;
}


UDouble::UDouble(double value) : UObject(std::make_shared<UDoubleData>(value)) {

}

double UDouble::get() const {
    return data<UDoubleData>().value;
}
