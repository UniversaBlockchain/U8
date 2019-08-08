//
// Created by Roman Uskov on 2018-12-17.
//

#ifndef UNITOOLS_UDATETIME_H
#define UNITOOLS_UDATETIME_H

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

        Local<Object> serializeToV8(Isolate* isolate) override {
            return Local<Object>::Cast(Date::New(isolate->GetCurrentContext(), double(value.time_since_epoch().count()*1e-6)).ToLocalChecked());
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
