/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "testutils.h"
#include <iostream>
#include <fstream>
#include "../tools/json.hpp"
#include "../tools/tools.h"

std::string inputTestParameter(const std::string& testName, const std::string& hint, const std::string& defValue) {
    std::string cachedDefValue = defValue;
    std::string fileName = std::string("/tmp") + "/vincent_tests_parameters_" + testName + ".json";

    nlohmann::json json;
    if (isFileExists(fileName)) {
        try {
            auto fileContent = getFileContents(fileName);
            json = nlohmann::json::parse(fileContent);
            cachedDefValue = json.at(hint);
        } catch (const std::exception& e) {
        }
    }

    std::string in = "";
    std::cout << hint << " (skip for default '" << cachedDefValue << "'): ";
    getline(std::cin, in);
    std::string resValue = in.empty() ? cachedDefValue : in;

    json[hint] = resValue;
    putFileContents(fileName, json.dump(2));

    return resValue;
}
