/*
 * Copyright (c) 2018-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef UNITOOLS_UDATETIME_H
#define UNITOOLS_UDATETIME_H

#include <string>
#include <memory>
#include <chrono>

#include "UObject.h"

typedef std::chrono::time_point<std::chrono::high_resolution_clock> TimePoint;

class UDateTime : public UObject {
private:
    class UDateTimeData : public UData {
    public:
        UDateTimeData(const TimePoint &v);
        ~UDateTimeData() override = default;

        Local<Object> serializeToV8(Local<Context> cxt, shared_ptr<Scripter> scripter) override {
            return Local<Object>::Cast(Date::New(scripter->isolate()->GetCurrentContext(), double(value.time_since_epoch().count()*1e-6)).ToLocalChecked());
        }

        void dbgPrint(std::string prefix) override {
            printf("DateTime=%lld\n", value.time_since_epoch().count());
        }

        TimePoint value;
    };

public:
    static bool isInstance(const UObject& object);

    static UDateTime& asInstance(UObject& object);

    static const UDateTime& asInstance(const UObject& object);


    UDateTime(const TimePoint& value);

    const TimePoint& get() const;
};


#endif //UNITOOLS_UOBJECT_H
