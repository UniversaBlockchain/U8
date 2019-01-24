//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_USTRING_H
#define UNITOOLS_USTRING_H

#include <memory>
#include <string>
#include "UObject.h"

class UString : public UObject {
private:
    class UStringData : public UData {
        public:
            UStringData(const std::string& v);

            ~UStringData() = default;

        std::string value;
    };

public:
    static bool isInstance(const UObject& object);

    static UString& asInstance(UObject& object);

    static const UString& asInstance(const UObject& object);



    UString(const std::string& value);

    const std::string& get() const;
};


#endif //UNITOOLS_UOBJECT_H
