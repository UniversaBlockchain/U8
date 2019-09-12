/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_CRYPTO_BINDINGS_H
#define U8_CRYPTO_BINDINGS_H

#include <v8.h>
#include "../crypto/HashId.h"
#include "../crypto/KeyAddress.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"

v8::Local<v8::Value> wrapHashId(shared_ptr<Scripter> scripter, crypto::HashId* hashId);
v8::Local<v8::Value> wrapKeyAddress(shared_ptr<Scripter> scripter, crypto::KeyAddress* keyAddress);
v8::Local<v8::Value> wrapPublicKey(shared_ptr<Scripter> scripter, crypto::PublicKey* publicKey);
v8::Local<v8::Value> wrapPrivateKey(shared_ptr<Scripter> scripter, crypto::PrivateKey* privateKey);

#endif //U8_CRYPTO_BINDINGS_H
