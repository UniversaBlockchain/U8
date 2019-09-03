/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_IODIR_H
#define U8_IODIR_H

#include "AsyncIO.h"
#include "IOHandle.h"
#include "IOHandleThen.h"
#include "IOFile.h"

namespace asyncio {

    /**
     * Directory open callback.
     *
     * @param result is directory open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened directory.
     */
    typedef std::function<void(ssize_t result)> openDir_cb;

    /**
     * Directory create callback.
     *
     * @param result is directory create result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is created.
     */
    typedef std::function<void(ssize_t result)> createDir_cb;

    /**
     * Directory remove callback.
     *
     * @param result is directory remove result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is removed.
     */
    typedef std::function<void(ssize_t result)> removeDir_cb;

    /**
     * Asynchronous directory.
     */
    class IODir {
    public:
        IODir(ioLoop* loop = asyncLoop);
        ~IODir();

        /**
         * Asynchronous open directory for scan.
         *
         * @param path to open directory.
         * @param callback caused when opening a directory or error.
         */
        void open(const char* path, openDir_cb callback);

        /**
         * Get next entry for scan directory.
         *
         * Directory entry is struct with fields:
         *      name - is name of file or directory
         *      type - is type of directory entry.
         * For check entry is file use isFile(entry).
         * @see isFile(const ioDirEntry& entry).
         * For check entry is directory use isDir(entry).
         * @see isDir(const ioDirEntry& entry).
         *
         * @param entry is pointer to next directory entry.
         * @return true - if a entry is successfully get,
         *         false - if can`t get a entry (reached the end of the directory).
         */
        bool next(ioDirEntry *entry);

        /**
         * Asynchronous open directory for scan with callback initialization in the method IODir::then.
         * @see IODir::then(result_cb callback).
         *
         * @param path to open directory.
         * @return pointer to open directory handle.
         */
        IODir* prepareOpen(const char* path);

        /**
         * Callback initialization for asynchronous opening directory for scan.
         * Used when the callback has not been initialized in methods IODir::prepareOpen.
         * @see IODir::prepareOpen(const char* path).
         *
         * @param callback is initialized callback for asynchronous opening directory for scan.
         * @return pointer to open directory handle.
         */
        IODir *then(result_cb callback);

        /**
         * Asynchronous create directory.
         *
         * @param path to created directory.
         * @param mode - specifies the directory mode bits be applied when a new directory is created (@see IOFile::open).
         * @param callback when the directory is created or an error occurs.
         */
        static void createDir(const char* path, int mode, createDir_cb callback);

        /**
         * Asynchronous remove directory.
         *
         * @param path to removed directory.
         * @param callback when the directory is removed or an error occurs.
         */
        static void removeDir(const char* path, removeDir_cb callback);

        /**
         * Asynchronous get stat of directory.
         *
         * @param path to directory.
         * @param callback caused when getting stat or error.
         */
        static void stat(const char* path, stat_cb callback);

    private:
        ioLoop* loop;
        uv_fs_t* ioReq;

        std::packaged_task<void(result_cb)> task;
        std::packaged_task<void(read_cb)> readTask;

        void initRequest();
        void freeRequest();

        static void _open_cb(asyncio::ioHandle *req);

        static void dir_onCreateOrRemove(asyncio::ioHandle *req);
    };
}

#endif //U8_IODIR_H
