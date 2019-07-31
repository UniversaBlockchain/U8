//
// Created by flint on 7/31/19.
//

#ifndef U8_UKEYADDRESS_H
#define U8_UKEYADDRESS_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../crypto/KeyAddress.h"

class UKeyAddress: public UObject {
private:
    class UKeyAddressData : public UData {
    public:
        UKeyAddressData();
        UKeyAddressData(const crypto::KeyAddress &val);
        ~UKeyAddressData() = default;

        std::shared_ptr<crypto::KeyAddress> keyAddress;
    };

public:
    UKeyAddress();
    UKeyAddress(const crypto::KeyAddress &val);

    static bool isInstance(const UObject& object);
    static UKeyAddress& asInstance(UObject& object);
    static const UKeyAddress& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    crypto::KeyAddress& getKeyAddress();
};

#endif //U8_UKEYADDRESS_H
