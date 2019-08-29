/*
 * Copyright (c) 2018 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UDateTime.h"

UDateTime::UDateTimeData::UDateTimeData(const TimePoint & v)  {
    value = v;
}

bool UDateTime::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UDateTimeData>();
}

UDateTime &UDateTime::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UDateTimeData>())
        throw std::invalid_argument("object is not instance of UDateTime");

    return (UDateTime&)object;
}

const UDateTime &UDateTime::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UDateTimeData>())
        throw std::invalid_argument("object is not instance of UDateTime");

    return (const UDateTime&)object;
}

UDateTime::UDateTime(const TimePoint& value) : UObject(std::make_shared<UDateTimeData>(value)) {

}

const TimePoint& UDateTime::get() const {
    return data<UDateTimeData>().value;
}
