//
// Created by Dmitriy Tairov on 12.01.19.
//

#ifndef U8_ASYNCIO_H
#define U8_ASYNCIO_H

#include <uv.h>
#include <vector>
#include <functional>
#include <memory>
#include <future>
#include <queue>
#include <any>
#include "AsyncLoop.h"

namespace asyncio {

#define WAIT_LOOP 5000000L

    /**
    * Handle of main asynchronous loop.
    */
    extern uv_loop_t* asyncLoop;

    /**
     * Exit handle for deinitialize main asynchronous loop.
     */
    extern uv_async_t exitHandle;

    /**
     * Handle of main asynchronous loop thread.
     */
    extern uv_thread_t thread_loop;

    /**
     * Alarm (event notify) handle of main asynchronous loop.
     */
    extern uv_async_t alarmHandle;

    /**
     * Period for check asynchronous loop queue.
     */
    extern std::chrono::microseconds asyncLoopPeriod;

    /**
     * Asynchronous request for file operations.
     */
    typedef uv_fs_t ioHandle;

    /**
     * Directory entry for scan directory.
     */
    typedef uv_dirent_t ioDirEntry;

    /**
     * Struct with stats of file or directory.
     */
    typedef uv_stat_t ioStat;

    /**
     * Asynchronous loop (for auxiliary loops).
     */
    typedef uv_loop_t ioLoop;

    /**
     * TCP socket struct (using for accept).
     */
    typedef uv_tcp_t ioTCPSocket;

    /**
     * Byte vector.
     */
    typedef std::vector<uint8_t> byte_vector;

    /**
     * IO handle type.
     */
    enum ioHandle_t {
        FILE,
        DIRECTORY,
        TCP_SOCKET_LISTEN,
        TCP_SOCKET_CONNECTED,
        UDP_SOCKET,
        TCP_SOCKET_ERROR,
        UDP_SOCKET_ERROR
    };

    /**
     * Init and run main asynchronous loop.
     * Must be called before asynchronous method calls.
     *
     * @param period for check asynchronous loop queue.
     */
    ioLoop* initAndRunLoop(std::chrono::microseconds period = 5ms);

    /**
     * Get handle of main asynchronous loop.
     */
    inline ioLoop* getMainLoop() { return asyncLoop; };

    /**
     * Deinitialize main asynchronous loop.
     * Must be called after asynchronous method calls.
     */
    void deinitLoop();

    /**
     * Check result for error.
     *
     * @param result from asynchronous callback.
     * @return true - if an error occurred,
     *         false - if the result is successful.
     */
    bool isError(ssize_t result);

    /**
     * Get error description by result.
     * isError(result) must be returned true.
     *
     * @param code is result from asynchronous callback.
     * @return error description.
     */
    const char* getError(ssize_t code);

    /**
     * Check whether the entry is a file.
     *
     * @param entry is directory entry (@see IOHandle::next).
     * @return true - if the entry is a file,
     *         false - if otherwise.
     */
    bool isFile(const ioDirEntry& entry);

    /**
     * Check whether the entry is a directory.
     *
     * @param entry is directory entry (@see IOHandle::next).
     * @return true - if the entry is a directory,
     *         false - if otherwise.
     */
    bool isDir(const ioDirEntry& entry);
};

#endif //U8_ASYNCIO_H
