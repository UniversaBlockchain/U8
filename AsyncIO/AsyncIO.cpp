//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    AsyncLoop* aLoop = nullptr;
    uv_loop_t* asyncLoop = nullptr;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

    AsyncLoop* initAndRunLoop() {

        umask(000);

        if (!aLoop) {
            aLoop = new AsyncLoop();
            asyncLoop = aLoop->getLoop();
        }

        return aLoop;
    }

    void deinitLoop() {
        if (aLoop)
            delete aLoop;
    }

    //===========================================================================================
    // Helpers implementation
    //===========================================================================================

    bool isError(ssize_t result) {
        return result < 0;
    }

    const char* getError(ssize_t code) {
        return uv_strerror(code);
    }

    bool isFile(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_FILE;
    }

    bool isDir(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_DIR;
    }
};
