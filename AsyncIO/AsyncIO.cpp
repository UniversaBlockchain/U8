//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;
    uv_async_t alarmHandle;
    uv_thread_t thread_loop;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

    ioLoop* initAndRunLoop() {

        umask(000);

        if (!asyncLoop) {
            asyncLoop = uv_loop_new();

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
        return uv_strerror(code);
    }

    bool isFile(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_FILE;
    }

    bool isDir(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_DIR;
    }
};
