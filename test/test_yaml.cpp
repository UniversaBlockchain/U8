/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "catch2.h"
#include <iostream>
#include "yaml-cpp/yaml.h"

using namespace std;

TEST_CASE("yaml_hello") {
    YAML::Node node = YAML::Load("[1, 2, 3]");
    REQUIRE(node.Type() == YAML::NodeType::Sequence);
    REQUIRE(node.IsSequence());  // a shortcut!
}
