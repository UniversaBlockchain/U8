/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UHashId.h"
#include "../UBytes.h"

UHashId::UHashIdData::UHashIdData() {
}

UHashId::UHashIdData::UHashIdData(const crypto::HashId &val) {
    hashId = std::make_shared<crypto::HashId>(val);
}

UHashId::UHashId(): UObject(std::make_shared<UHashIdData>()) {
}

UHashId::UHashId(const crypto::HashId &val): UObject(std::make_shared<UHashIdData>(val)) {
}

bool UHashId::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UHashIdData>();
}

UHashId& UHashId::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UHashIdData>())
        throw std::invalid_argument("object is not instance of UHashId");

    return (UHashId&) object;
}

const UHashId& UHashId::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UHashIdData>())
        throw std::invalid_argument("object is not instance of UHashId");

    return (const UHashId&) object;
}

UBinder UHashId::decompose() {
    return UBinder::of("composite3", UBytes(getHashId().getDigest()));
}

void UHashId::compose(const UBinder& data) {
    this->data<UHashIdData>().hashId = std::make_shared<crypto::HashId>(
            crypto::HashId::withDigest(UBytes::asInstance(data.get("composite3")).get()));
}

crypto::HashId& UHashId::getHashId() {
    return *data<UHashIdData>().hashId.get();
}
