//
// Created by flint on 8/6/19.
//

#ifndef U8_CRYPTO_BINDINGS_H
#define U8_CRYPTO_BINDINGS_H

#include <v8.h>
#include "../crypto/HashId.h"
#include "../crypto/KeyAddress.h"

v8::Local<v8::Value> wrapHashId(v8::Isolate* isolate, crypto::HashId* hashId);
v8::Local<v8::Value> wrapKeyAddres(v8::Isolate* isolate, crypto::KeyAddress* keyAddress);

#endif //U8_CRYPTO_BINDINGS_H
