//
// Created by Dmitriy Tairov on 26.12.18.
//

#ifndef UNIVERSA_TESTCOMPLEXOBJECT_H
#define UNIVERSA_TESTCOMPLEXOBJECT_H

#include "UString.h"
#include "UInt.h"
#include "UBinder.h"
#include "../serialization/BaseSerializer.h"

class TestComplexObject : public UObject {
private:
    class UTestComplexObjectData : public UData {
    public:
        UTestComplexObjectData();

        UTestComplexObjectData(const std::string& name, int64_t amount);

        ~UTestComplexObjectData() = default;

        std::string name;
        int64_t amount;
    };

public:
    TestComplexObject();

    TestComplexObject(const std::string& name, int64_t amount);

    static bool isInstance(const UObject& object);

    static TestComplexObject& asInstance(UObject& object);

    static const TestComplexObject& asInstance(const UObject& object);

    UBinder decompose();

    void compose(const UBinder& data);

    std::string getName();

    int64_t getAmount();
};


#endif //UNIVERSA_TESTCOMPLEXOBJECT_H
