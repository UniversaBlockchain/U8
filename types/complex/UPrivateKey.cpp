//
// Created by flint on 8/8/19.
//

#include "UPrivateKey.h"
#include "../UBytes.h"

UPrivateKey::UPrivateKeyData::UPrivateKeyData() {
}

UPrivateKey::UPrivateKeyData::UPrivateKeyData(const crypto::PrivateKey &val) {
    privateKey = std::make_shared<crypto::PrivateKey>(val);
}

UPrivateKey::UPrivateKey(): UObject(std::make_shared<UPrivateKeyData>()) {
}

UPrivateKey::UPrivateKey(const crypto::PrivateKey &val): UObject(std::make_shared<UPrivateKeyData>(val)) {
}

bool UPrivateKey::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UPrivateKeyData>();
}

UPrivateKey& UPrivateKey::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UPrivateKeyData>())
        throw std::invalid_argument("object is not instance of UPrivateKey");

    return (UPrivateKey&) object;
}

const UPrivateKey& UPrivateKey::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UPrivateKeyData>())
        throw std::invalid_argument("object is not instance of UPrivateKey");

    return (const UPrivateKey&) object;
}

UBinder UPrivateKey::decompose() {
    return UBinder::of("packed", UBytes(getPrivateKey().pack()));
}

void UPrivateKey::compose(const UBinder& data) {
    this->data<UPrivateKeyData>().privateKey = std::make_shared<crypto::PrivateKey>(
            UBytes::asInstance(data.get("packed")).get());
}

crypto::PrivateKey& UPrivateKey::getPrivateKey() {
    return *data<UPrivateKeyData>().privateKey.get();
}
