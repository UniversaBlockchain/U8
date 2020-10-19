/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_MODULE_H
#define U8_MODULE_H

#include <string>
#include <vector>
#include <map>
#include <memory>
#include "zip.h"

class Scripter;

class U8Module {
    std::string name;
    std::string modulePath;
    std::string homeDir;
    std::vector<std::string> require_roots;

    int lenSignData = 0;
    std::map<std::string, std::string> manifest;

    bool checkKeyTrust(std::vector<unsigned char> &keyData, Scripter* se);
    bool checkUNS(std::string UNSname, std::vector<unsigned char> &keyData, Scripter* se);
    bool checkSigner(std::vector<unsigned char> &keyData, const std::string &signer);
    std::map<std::string, std::string> loadManifest(zip* module);
    bool initRequireRoots();
    std::string searchU8Module(std::string basePath);
    std::string searchU8TrustFile();

public:
    U8Module(const std::string& modulePath, const std::string &homeDir);

    bool load();
    bool checkModuleSignature(Scripter* se, const std::string &signer);

    std::string getName();
    std::string resolveRequiredFile(const std::string &fileName);

    std::string getFileFromURL(const std::string &url);
};


#endif //U8_MODULE_H
