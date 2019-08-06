//
// Created by flint on 8/3/19.
//

#include "UPublicKey.h"
#include "../UBytes.h"

UPublicKey::UPublicKeyData::UPublicKeyData() {
}

UPublicKey::UPublicKeyData::UPublicKeyData(const crypto::PublicKey &val) {
    publicKey = std::make_shared<crypto::PublicKey>(val);
}

UPublicKey::UPublicKey(): UObject(std::make_shared<UPublicKeyData>()) {
}

UPublicKey::UPublicKey(const crypto::PublicKey &val): UObject(std::make_shared<UPublicKeyData>(val)) {
}

bool UPublicKey::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UPublicKeyData>();
}

UPublicKey& UPublicKey::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UPublicKeyData>())
        throw std::invalid_argument("object is not instance of UPublicKey");

    return (UPublicKey&) object;
}

const UPublicKey& UPublicKey::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UPublicKeyData>())
        throw std::invalid_argument("object is not instance of UPublicKey");

    return (const UPublicKey&) object;
}

UBinder UPublicKey::decompose() {
    return UBinder::of("packed", UBytes(getPublicKey().pack()));
}

void UPublicKey::compose(const UBinder& data) {
    this->data<UPublicKeyData>().publicKey = std::make_shared<crypto::PublicKey>(
            UBytes::asInstance(data.get("packed")).get());
}

crypto::PublicKey& UPublicKey::getPublicKey() {
    return *data<UPublicKeyData>().publicKey.get();
}
