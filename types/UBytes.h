//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UBYTES_H
#define UNITOOLS_UBYTES_H

#include <memory>
#include <vector>
#include "UObject.h"

class UBytes : public UObject {
private:
    class UBytesData : public UData {
        public:
            UBytesData(const unsigned char* v, unsigned int size);
            UBytesData();

            ~UBytesData() {
            };

        std::vector<unsigned char> value;
    };

public:
    static bool isInstance(const UObject& object);

    static UBytes& asInstance(UObject& object);

    static const UBytes& asInstance(const UObject& object);


    UBytes(std::vector<unsigned char>&& val);
    UBytes(const unsigned  char* value, unsigned int size);
    const std::vector<unsigned char>& get() const;
};


#endif //UNITOOLS_UOBJECT_H
