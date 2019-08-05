//
// Created by flint on 8/5/19.
//

#ifndef U8_ISERIALIZABLEV8_H
#define U8_ISERIALIZABLEV8_H

#include <v8.h>
using namespace v8;

class ISerializableV8 {
public:
    virtual Local<Object>& serializeToV8(Isolate* isolate, Local<Object>& dst) = 0;
};

#endif //U8_ISERIALIZABLEV8_H
