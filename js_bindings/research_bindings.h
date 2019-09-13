/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_RESEARCH_BINDINGS_H
#define U8_RESEARCH_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitResearchBindings(Scripter& scripter, const Local<ObjectTemplate> &global);

#endif //U8_RESEARCH_BINDINGS_H
