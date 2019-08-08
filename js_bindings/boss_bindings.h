//
// Created by flint on 8/5/19.
//

#ifndef U8_BOSS_BINDINGS_H
#define U8_BOSS_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitBossBindings(Isolate *isolate, const Local<ObjectTemplate> &global);

shared_ptr<Persistent<Object>> getHashIdPrototype();
shared_ptr<Persistent<Object>> getPublicKeyPrototype();

#endif //U8_BOSS_BINDINGS_H
