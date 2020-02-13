/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "USerializationError.h"

USerializationError::USerializationErrorData::USerializationErrorData() {
}

USerializationError::USerializationErrorData::USerializationErrorData(const std::string& v)  {
    strValue = v;
}

bool USerializationError::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<USerializationErrorData>();
}

USerializationError &USerializationError::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<USerializationErrorData>())
        throw std::invalid_argument("object is not instance of USerializationError");

    return (USerializationError&)object;
}

const USerializationError &USerializationError::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<USerializationErrorData>())
        throw std::invalid_argument("object is not instance of USerializationError");

    return (const USerializationError&)object;
}

USerializationError::USerializationError(): UObject(std::make_shared<USerializationErrorData>()) {
}

USerializationError::USerializationError(const std::string& value) : UObject(std::make_shared<USerializationErrorData>(value)) {
}

UBinder USerializationError::decompose() {
    return UBinder::of("strValue", UString(getValue()));
}

void USerializationError::compose(const UBinder& data) {
    this->data<USerializationErrorData>().strValue = data.getString("strValue");
}

const std::string& USerializationError::getValue() const {
    return data<USerializationErrorData>().strValue;
}
