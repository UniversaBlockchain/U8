/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "AsyncIO.h"
#include "TLS/uv_tls.h"
#include <thread>

namespace asyncio {

    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;
    uv_async_t alarmHandle;
    uv_thread_t thread_loop;
    std::chrono::microseconds asyncLoopPeriod;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

    ioLoop* initAndRunLoop(std::chrono::microseconds period) {

        umask(000);
        asyncLoopPeriod = period;

        if (!asyncLoop) {
            asyncLoop = (uv_loop_t*) malloc(sizeof(uv_loop_t));
            uv_loop_init(asyncLoop);

            //Opened async handle will keep the loop alive
            uv_async_init(asyncLoop, &exitHandle, [](uv_async_t* asyncHandle){
                uv_close((uv_handle_t*) &alarmHandle, nullptr);
                uv_close((uv_handle_t*) &exitHandle, nullptr);
            });

            uv_async_init(asyncLoop, &alarmHandle, [](uv_async_t* asyncHandle){});

            uv_thread_create(&thread_loop, [](void *arg){
                uv_loop_t* loop = asyncLoop;

                uv_run(loop, UV_RUN_DEFAULT);

                uv_walk(loop, [](uv_handle_t* handle, void* data){
                    uv_close(handle, nullptr);
                }, nullptr);
                uv_run(loop, UV_RUN_DEFAULT);
                uv_loop_close(loop);

                free(asyncLoop);
                asyncLoop = nullptr;
            }, nullptr);

            //wait for init loop
            nanosleep((const struct timespec[]){{0, WAIT_LOOP}}, nullptr);
        }

        return asyncLoop;
    }

    void deinitLoop() {
        if (asyncLoop) {
            uv_async_send(&exitHandle);
            //uv_thread_join(&thread_loop);
        }
    }

    //===========================================================================================
    // Helpers implementation
    //===========================================================================================

    bool isError(ssize_t result) {
        return result < 0;
    }

    const char* getError(ssize_t code) {
        if (code == ERR_TLS_INIT_CONTEXT)
            return "Error initialization TLS context";
        else if (code == ERR_TLS_GET_TLS_SESSION)
            return "Error initialization new TLS session from context";
        else if (code == ERR_TLS_CONNECT_TIMEOUT)
            return "Failed to establish TLS handshake when connecting";
        else if (code == ERR_TLS_ACCEPT_TIMEOUT)
            return "Failed to establish TLS handshake when accepting";
        else
            return uv_strerror((int) code);
    }

    bool isFile(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_FILE;
    }

    bool isDir(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_DIR;
    }
};
