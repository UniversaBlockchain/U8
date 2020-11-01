/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_MODULEMANAGER_H
#define U8_MODULEMANAGER_H

#include <map>
#include <atomic>
#include <mutex>
#include "../js_bindings/Scripter.h"
#include "U8Module.h"

class ModuleManager {
    std::map<std::string, std::shared_ptr<U8Module>> modules;
    std::map<std::string, std::shared_ptr<U8Module>> modulesByPath;

    std::atomic<bool> inZip = false;
    std::atomic<bool> u8coreLoaded = false;
    std::string startingModuleName;

    std::mutex mutex;

public:
    bool loadModule(const std::string& sourceName, Scripter* se, bool isStarting = false, bool inUBot = false, const std::string& signer = "");

    std::shared_ptr<U8Module> getModule(const std::string& moduleName);

    inline bool isU8coreLoaded() { return u8coreLoaded.load(); }

    inline bool isInZip() { return inZip.load(); }

    inline void setInZip(bool initInZip) { inZip = initInZip; }

    inline std::string getStartingModuleName() { return startingModuleName; };
};


#endif //U8_MODULEMANAGER_H
