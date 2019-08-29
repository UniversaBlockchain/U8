/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "UKeyAddress.h"
#include "../UBytes.h"

UKeyAddress::UKeyAddressData::UKeyAddressData() {
}

UKeyAddress::UKeyAddressData::UKeyAddressData(const crypto::KeyAddress &val) {
    keyAddress = std::make_shared<crypto::KeyAddress>(val);
}

UKeyAddress::UKeyAddress(): UObject(std::make_shared<UKeyAddressData>()) {
}

UKeyAddress::UKeyAddress(const crypto::KeyAddress &val): UObject(std::make_shared<UKeyAddressData>(val)) {
}

bool UKeyAddress::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UKeyAddressData>();
}

UKeyAddress& UKeyAddress::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UKeyAddressData>())
        throw std::invalid_argument("object is not instance of UKeyAddress");

    return (UKeyAddress&) object;
}

const UKeyAddress& UKeyAddress::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UKeyAddressData>())
        throw std::invalid_argument("object is not instance of UKeyAddress");

    return (const UKeyAddress&) object;
}

UBinder UKeyAddress::decompose() {
    return UBinder::of("uaddress", UBytes(getKeyAddress().getPacked()));
}

void UKeyAddress::compose(const UBinder& data) {
    this->data<UKeyAddressData>().keyAddress = std::make_shared<crypto::KeyAddress>(
            UBytes::asInstance(data.get("uaddress")).get());
}

crypto::KeyAddress& UKeyAddress::getKeyAddress() {
    return *data<UKeyAddressData>().keyAddress.get();
}
