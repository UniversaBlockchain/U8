/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_BOSS_BINDINGS_H
#define U8_BOSS_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitBossBindings(Scripter& scripter, Isolate *isolate, const Local<ObjectTemplate> &global);

shared_ptr<Persistent<Object>> getHashIdPrototype(Scripter& scripter);
shared_ptr<Persistent<Object>> getPublicKeyPrototype(Scripter& scripter);
shared_ptr<Persistent<Object>> getPrivateKeyPrototype(Scripter& scripter);

#endif //U8_BOSS_BINDINGS_H
