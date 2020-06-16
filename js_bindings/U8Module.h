/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_MODULE_H
#define U8_MODULE_H

#include <string>
#include <vector>
#include <map>
#include "zip.h"

class U8Module {
    std::string name;
    std::string modulePath;
    std::string homeDir;
    std::vector<std::string> require_roots;

    int lenSignData = 0;
    std::map<std::string, std::string> manifest;

    bool checkKeyTrust(std::vector<unsigned char> &keyData);
    std::map<std::string, std::string> loadManifest(zip* module);
    bool initRequireRoots();

public:
    U8Module(const std::string& modulePath, const std::string &homeDir);

    bool load();
    bool checkModuleSignature();

    std::string getName();
    std::string resolveRequiredFile(const std::string &fileName);
};


#endif //U8_MODULE_H