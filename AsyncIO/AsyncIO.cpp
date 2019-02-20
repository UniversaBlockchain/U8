//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    AsyncLoop* aLoop = nullptr;
    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;
    uv_async_t alarmHandle;
    uv_thread_t thread_loop;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

    ioLoop* initAndRunLoop() {

        umask(000);

        if (!aLoop)
            aLoop = new AsyncLoop();

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

    void alarmLoop() {
        uv_async_send(&alarmHandle);
    }

    void deinitLoop() {
        if (aLoop)
            delete aLoop;

        if (asyncLoop) {
            uv_async_send(&exitHandle);
            //uv_thread_join(&thread_loop);
        }
    }

    ioLoop* initAndRunAuxLoop() {

        umask(000);

        uv_loop_t* loop = uv_loop_new();
        uv_async_t* loop_exitHandle = new uv_async_t();
        uv_async_t* loop_alarmHandle = new uv_async_t();
        uv_thread_t* thread_auxLoop = new uv_thread_t();

        auto loop_data = new auxLoop_data();
        loop_data->loop_exitHandle = loop_exitHandle;
        loop_data->loop_alarmHandle = loop_alarmHandle;
        loop_data->thread_auxLoop = thread_auxLoop;

        loop->data = loop_data;

        loop_exitHandle->data = (void*) loop_alarmHandle;

        //Opened async handle will keep the loop alive
        uv_async_init(loop, loop_exitHandle, [](uv_async_t* asyncHandle){
            if (asyncHandle->data)
                uv_close((uv_handle_t*) asyncHandle->data, [](uv_handle_t* handle){
                    delete handle;
                });
            uv_close((uv_handle_t*) asyncHandle, [](uv_handle_t* handle){
                delete handle;
            });
        });

        uv_async_init(loop, loop_alarmHandle, [](uv_async_t* asyncHandle){});

        uv_thread_create(thread_auxLoop, [](void *arg){

            uv_run((uv_loop_t*) arg, UV_RUN_DEFAULT);

            uv_walk((uv_loop_t*) arg, [](uv_handle_t* handle, void* data){
                uv_close(handle, nullptr);
            }, nullptr);
            uv_run((uv_loop_t*) arg, UV_RUN_DEFAULT);
            uv_loop_close((uv_loop_t*) arg);

            auto l_data = (auxLoop_data*) ((uv_loop_t*) arg)->data;
            if (l_data) {
                delete l_data->thread_auxLoop;
                delete l_data;
            }
        }, (void*) loop);

        //wait for init loop
        nanosleep((const struct timespec[]){{0, WAIT_LOOP}}, nullptr);

        return loop;
    }

    void alarmAuxLoop(ioLoop* loop) {
        if (loop == asyncLoop) {
            alarmLoop();
            return;
        }

        auto loop_data = (auxLoop_data*) loop->data;

        if (loop_data)
            uv_async_send(loop_data->loop_alarmHandle);
    }

    void deinitAuxLoop(ioLoop* loop) {
        if (loop) {
            auto loop_data = (auxLoop_data*) loop->data;
            if (loop_data) {
                uv_async_send(loop_data->loop_exitHandle);
                //uv_thread_join(loop_data->thread_auxLoop);
            }
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
