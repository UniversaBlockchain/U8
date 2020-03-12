/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_ASYNC_IO_BINDINGS_H
#define U8_ASYNC_IO_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitIOFile(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitIOTCP(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitIOTLS(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitIOUDP(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitIODir(Scripter& scripter, const Local<ObjectTemplate> &global);
void JsInitZipBindings(Scripter& scripter, const Local<ObjectTemplate> &global);

#endif //U8_ASYNC_IO_BINDINGS_H
