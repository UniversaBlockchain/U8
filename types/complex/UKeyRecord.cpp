//
// Created by flint on 8/3/19.
//

#include "UKeyRecord.h"
#include "../UBytes.h"
#include "../../serialization/BaseSerializer.h"
#include "../complex/UPublicKey.h"
#include "../../crypto/base64.h"

UKeyRecord::UKeyRecordData::UKeyRecordData() {
}

UKeyRecord::UKeyRecordData::UKeyRecordData(const KeyRecord &val) {
    keyRecord = std::make_shared<KeyRecord>(val);
}

UKeyRecord::UKeyRecord(): UObject(std::make_shared<UKeyRecordData>()) {
}

UKeyRecord::UKeyRecord(const KeyRecord &val): UObject(std::make_shared<UKeyRecordData>(val)) {
}

bool UKeyRecord::isInstance(const UObject &object) {
    return object.dataIsInstanceOf<UKeyRecordData>();
}

UKeyRecord& UKeyRecord::asInstance(UObject &object) {
    if(!object.dataIsInstanceOf<UKeyRecordData>())
        throw std::invalid_argument("object is not instance of UKeyRecord");

    return (UKeyRecord&) object;
}

const UKeyRecord& UKeyRecord::asInstance(const UObject &object) {
    if(!object.dataIsInstanceOf<UKeyRecordData>())
        throw std::invalid_argument("object is not instance of UKeyRecord");

    return (const UKeyRecord&) object;
}

UBinder UKeyRecord::decompose() {
    return UBinder::of("key", "");//BaseSerializer::serialize(getKeyRecord().publicKey));
}

void UKeyRecord::compose(const UBinder& data) {
    try {
        this->data<UKeyRecordData>().keyRecord = std::make_shared<KeyRecord>();
        UObject obj = data.get("key");
        if (UPublicKey::isInstance(obj)) {
            getKeyRecord().publicKey = std::make_shared<crypto::PublicKey>(UPublicKey::asInstance(obj).getPublicKey());

            //TODO: } else if (UPrivateKey::isInstance(obj)) { ...

        } else if (UString::isInstance(obj)) {
            getKeyRecord().publicKey = std::make_shared<crypto::PublicKey>(
                    base64_decodeToBytes(UString::asInstance(obj).get()));
        } else if (UBytes::isInstance(obj)) {
            getKeyRecord().publicKey = std::make_shared<crypto::PublicKey>(UBytes::asInstance(obj).get());
        } else {
            throw std::invalid_argument(std::string("unsupported key object: ") + typeid(obj).name());
        }
    } catch (const std::exception& e) {
        throw std::invalid_argument(std::string("unsupported key, failed to construct, ") + e.what());
    }
}

KeyRecord& UKeyRecord::getKeyRecord() {
    return *data<UKeyRecordData>().keyRecord.get();
}
