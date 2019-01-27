//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UBOOL_H
#define UNITOOLS_UBOOL_H

#include <memory>
#include "UObject.h"

class UBool : public UObject {
private:
    class UBoolData : public UData {
        public:
            UBoolData(bool v);

            ~UBoolData() = default;

        bool value;
    };

public:
    static bool isInstance(const UObject& object);

    static UBool& asInstance(UObject& object);

    static const UBool& asInstance(const UObject& object);



    UBool(bool value);

    bool get() const;
};


#endif //UNITOOLS_UOBJECT_H
