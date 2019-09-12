/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_WEB_BINDINGS_H
#define U8_WEB_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitNetwork(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitHttpServerRequest(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitHttpServerSecureRequest(Scripter& scripter, const Local<ObjectTemplate> &global);

#endif //U8_WEB_BINDINGS_H
