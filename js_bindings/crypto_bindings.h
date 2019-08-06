//
// Created by flint on 8/6/19.
//

#ifndef U8_CRYPTO_BINDINGS_H
#define U8_CRYPTO_BINDINGS_H

#include <v8.h>
#include "../crypto/HashId.h"
#include "../crypto/KeyAddress.h"

v8::Local<v8::Value> wrapHashId(v8::Isolate* isolate, crypto::HashId* hashId);
v8::Local<v8::Value> wrapKeyAddress(v8::Isolate* isolate, crypto::KeyAddress* keyAddress);
v8::Local<v8::Value> wrapPublicKey(v8::Isolate* isolate, crypto::PublicKey* publicKey);

#endif //U8_CRYPTO_BINDINGS_H
