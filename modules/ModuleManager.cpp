/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "ModuleManager.h"

extern const char *U8COREMODULE_NAME;

bool ModuleManager::loadModule(const std::string& sourceName, Scripter* se, bool isStarting) {
    lock_guard lock(mutex);

    if (modulesByPath.find(sourceName) != modulesByPath.end())
        return true;

    std::shared_ptr<U8Module> module = std::make_shared<U8Module>(sourceName, se->getHome());

    // loading module
    if (!module->load())
        return false;

    if (modules.find(module->getName()) != modules.end()) {   // if module with this name was already loaded
        if (isStarting)
            startingModuleName = module->getName();

        return true;
    }

    mutex.unlock();

    // check signature
    bool res = module->checkModuleSignature(se);
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
    lock_guard lock(mutex);

    auto module = modules.find(moduleName);
    if (module != modules.end())
        return module->second;
    else
        return std::shared_ptr<U8Module>();
}

ModuleManager mainModuleManager;