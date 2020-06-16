/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "testutils.h"
#include <iostream>
#include <fstream>
#include "../tools/json.hpp"
#include "../tools/tools.h"

bool isFileExists(const std::string& fileName) {
    std::ifstream in(fileName);
    return in.good();
}

std::string getFileContents(const std::string& fileName)
{
    std::ifstream in(fileName, std::ios::in | std::ios::binary);
    if (in)
    {
        std::string contents;
        in.seekg(0, std::ios::end);
        contents.resize((size_t)in.tellg());
        in.seekg(0, std::ios::beg);
        in.read(&contents[0], contents.size());
        in.close();
        return(contents);
    }
    return "";
}

bool putFileContents(const std::string& fileName, const std::string& text) {
    std::ofstream out(fileName, std::ios::trunc);
    if (out) {
        out << text;
        out.close();
        return true;
    }
    return false;
}

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
