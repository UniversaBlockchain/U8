//
// Created by flint on 8/5/19.
//

#ifndef U8_BOSS_BINDINGS_H
#define U8_BOSS_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitBossBindings(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_BOSS_BINDINGS_H
