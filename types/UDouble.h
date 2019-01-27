//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UDOUBLE_H
#define UNITOOLS_UDOUBLE_H

#include <memory>
#include "UObject.h"

class UDouble : public UObject {
private:
    class UDoubleData : public UData {
        public:
            UDoubleData(double v);

            ~UDoubleData() = default;

        double value;
    };

public:
    static bool isInstance(const UObject& object);

    static UDouble& asInstance(UObject& object);

    static const UDouble& asInstance(const UObject& object);



    UDouble(double value);

    double get() const;
};


#endif //UNITOOLS_UOBJECT_H
