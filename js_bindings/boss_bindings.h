/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_BOSS_BINDINGS_H
#define U8_BOSS_BINDINGS_H

#include "Scripter.h"

using namespace v8;
using namespace std;

class USerializationErrorImpl {
public:
    explicit USerializationErrorImpl(const std::string& s): strValue(s) {
    }
    std::string getStrValue() {
        return strValue;
    }
private:
    std::string strValue;
};

void JsInitBossBindings(Scripter& scripter, const Local<ObjectTemplate> &global);

shared_ptr<Persistent<Object>> getHashIdPrototype(shared_ptr<Scripter> scripter);
shared_ptr<Persistent<Object>> getPublicKeyPrototype(shared_ptr<Scripter> scripter);
shared_ptr<Persistent<Object>> getPrivateKeyPrototype(shared_ptr<Scripter> scripter);

v8::Local<v8::Value> wrapUSerializationError(shared_ptr<Scripter> scripter, USerializationErrorImpl* obj);

#endif //U8_BOSS_BINDINGS_H
