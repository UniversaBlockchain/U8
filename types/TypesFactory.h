//
// Created by flint on 8/7/19.
//

#ifndef U8_TYPESFACTORY_H
#define U8_TYPESFACTORY_H

#include <v8.h>
#include "UObject.h"

UObject v8ValueToUObject(v8::Isolate* isolate, v8::Local<Value> v8value);

#endif //U8_TYPESFACTORY_H
