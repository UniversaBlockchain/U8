//
// Created by Leonid Novikov on 4/8/19.
//

#ifndef U8_WEB_BINDINGS_H
#define U8_WEB_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

void JsInitNetwork(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitHttpServerRequest(Isolate *isolate, const Local<ObjectTemplate> &global);
void JsInitHttpServerSecureRequest(Isolate *isolate, const Local<ObjectTemplate> &global);

#endif //U8_WEB_BINDINGS_H
