/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "ModuleManager.h"

extern const char *U8COREMODULE_NAME;

bool ModuleManager::loadModule(const std::string& sourceName, Scripter* se, bool isStarting, const std::string& signer) {
    mutex.lock();

    if (modulesByPath.find(sourceName) != modulesByPath.end()) {
        mutex.unlock();
        return true;
    }

    std::shared_ptr<U8Module> module = std::make_shared<U8Module>(sourceName, se->getHome());

    // loading module
    if (!module->load()) {
        mutex.unlock();
        return false;
    }

    if (modules.find(module->getName()) != modules.end()) {   // if module with this name was already loaded
        if (isStarting)
            startingModuleName = module->getName();

        mutex.unlock();
        return true;
    }

    mutex.unlock();

    // check signature
    bool res = module->checkModuleSignature((module->getName() == U8COREMODULE_NAME || isStarting) ? se: nullptr, signer);
    if (res) {
        mutex.lock();

        modules.insert(std::pair<std::string, std::shared_ptr<U8Module>>(module->getName(), module));
        modulesByPath.insert(std::pair<std::string, std::shared_ptr<U8Module>>(sourceName, module));

        if (module->getName() == U8COREMODULE_NAME)
            u8coreLoaded = true;

        if (isStarting)
            startingModuleName = module->getName();

        mutex.unlock();

        //printf("Module %s successfully loaded\n", module->getName().data());
    }

    return res;
}

std::shared_ptr<U8Module> ModuleManager::getModule(const std::string& moduleName) {
    mutex.lock();

    auto module = modules.find(moduleName);
    bool found = module != modules.end();

    mutex.unlock();

    if (found)
        return module->second;
    else
        return std::shared_ptr<U8Module>();
}

ModuleManager mainModuleManager;