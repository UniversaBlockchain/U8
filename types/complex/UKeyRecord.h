//
// Created by flint on 8/3/19.
//

#ifndef U8_UKEYRECORD_H
#define U8_UKEYRECORD_H

#include "../UObject.h"
#include "../UBinder.h"
#include "../../universa_core/KeyRecord.h"

class UKeyRecord: public UObject {
private:
    class UKeyRecordData : public UData {
    public:
        UKeyRecordData();
        UKeyRecordData(const KeyRecord &val);
        ~UKeyRecordData() = default;

        std::shared_ptr<KeyRecord> keyRecord;
    };

public:
    UKeyRecord();
    UKeyRecord(const KeyRecord &val);

    static bool isInstance(const UObject& object);
    static UKeyRecord& asInstance(UObject& object);
    static const UKeyRecord& asInstance(const UObject& object);

    UBinder decompose();
    void compose(const UBinder& data);

    KeyRecord& getKeyRecord();
};

#endif //U8_UKEYRECORD_H
