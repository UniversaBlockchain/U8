/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_PG_BINDINGS_H
#define U8_PG_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitPGPool(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitBusyConnection(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitQueryResult(Scripter& scripter, const Local<ObjectTemplate> &global);

#endif //U8_PG_BINDINGS_H
