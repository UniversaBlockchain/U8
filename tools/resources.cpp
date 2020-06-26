/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "resources.h"

static byte_vector bv_getU8CoreU8M_binary;

const byte_vector& getU8CoreU8M_binary() {
#include "../u8core.u8m.c"
    if (bv_getU8CoreU8M_binary.empty())
        bv_getU8CoreU8M_binary = byte_vector(std::begin(__u8core_u8m), std::end(__u8core_u8m));
    return bv_getU8CoreU8M_binary;
}
