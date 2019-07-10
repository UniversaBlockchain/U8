//
// Created by flint on 7/10/19.
//

#ifndef U8_RESEARCH_BINDINGS_H
#define U8_RESEARCH_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitResearchBindings(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_RESEARCH_BINDINGS_H
