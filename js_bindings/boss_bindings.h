/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_BOSS_BINDINGS_H
#define U8_BOSS_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitBossBindings(Isolate *isolate, const Local<ObjectTemplate> &global);

shared_ptr<Persistent<Object>> getHashIdPrototype();
shared_ptr<Persistent<Object>> getPublicKeyPrototype();
shared_ptr<Persistent<Object>> getPrivateKeyPrototype();

#endif //U8_BOSS_BINDINGS_H
