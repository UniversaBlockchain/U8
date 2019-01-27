//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UINT_H
#define UNITOOLS_UINT_H

#include <memory>
#include "UObject.h"

class UInt : public UObject {
private:
    class UIntData : public UData {
        public:
            UIntData(int64_t v);

            ~UIntData() = default;

        int64_t value;
    };

public:
    static bool isInstance(const UObject& object);

    static UInt& asInstance(UObject& object);

    static const UInt& asInstance(const UObject& object);



    UInt(int64_t value);

    int64_t get() const;
};


#endif //UNITOOLS_UOBJECT_H
