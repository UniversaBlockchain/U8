//
// Created by Tairov Dmitriy on 18.03.19.
//

#ifndef U8_PG_BINDINGS_H
#define U8_PG_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitPGPool(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitBusyConnection(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitQueryResult(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_PG_BINDINGS_H
