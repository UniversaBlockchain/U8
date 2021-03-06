/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "catch2.h"

#include "../js_bindings/binding_tools.h"


TEST_CASE("fnptr") {
    int val1 = 10;
    int val2 = 20;
    int res = 0;

    void (*fn1)()= fnptr<void()>( [&val1,&res]() {
        res += val1;
    });
    auto fn2 = fnptr<void()>( [&val2,&res]() {
        res += val2;
    });

    fn1();
    REQUIRE( res == 10);
    val1 = 1; fn1();
    REQUIRE( res == 11);
    fn2();
    REQUIRE(res == 31);
}
