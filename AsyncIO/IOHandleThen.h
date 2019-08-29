/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_IOHANDLETHEN_H
#define U8_IOHANDLETHEN_H

#include "AsyncIO.h"
#include "IOHandle.h"

namespace asyncio {

    /**
     * Asynchronous file with deferred callback initialization.
     */
    class IOHandleThen : public IOHandle {
    public:
        /**
         * Asynchronous read file with callback initialization in the method IOHandleThen::then.
         * @see IOHandleThen::then(readFile_cb callback).
         *
         * @param maxBytesToRead is maximum number of bytes to read from file.
         * @return pointer to open file handle.
         */
        IOHandleThen* prepareRead(size_t maxBytesToRead);

        /**
         * Asynchronous write file with callback initialization in the method IOHandleThen::then.
         * @see IOHandleThen::then(result_cb callback).
         *
         * @param data is byte vector for data written to file.
         * @return pointer to open file handle.
         */
        IOHandleThen* prepareWrite(const byte_vector &data);

        /**
         * Asynchronous close file with callback initialization in the method IOHandleThen::then.
         * @see IOHandleThen::then(result_cb callback).
         *
         * @return pointer to open file handle.
         */
        IOHandleThen* prepareClose();

        /**
         * Callback initialization for asynchronous opening, writing and closing file.
         * Used when the callback has not been initialized in methods IOFile::prepareOpen, IOHandleThen::write and
         * IOHandleThen::close.
         * @see IOFile::prepareOpen(const char *path, int flags, int mode).
         * @see IOHandleThen::prepareWrite(const byte_vector& data).
         * @see IOHandleThen::prepareClose().
         *
         * @param callback is initialized callback for asynchronous opening, writing and closing file.
         * @return pointer to open file handle.
         */
        IOHandleThen* then(result_cb callback);

        /**
         * Callback initialization for asynchronous reading file.
         * Used when the callback has not been initialized in method IOHandleThen::prepareRead.
         * @see IOHandleThen::prepareRead(size_t maxBytesToRead).
         *
         * @param callback is initialized callback for asynchronous reading file.
         * @return pointer to open file handle.
         */
        IOHandleThen* then(read_cb callback);

    protected:
        std::packaged_task<void(result_cb)> task;
        std::packaged_task<void(read_cb)> readTask;
    };
}

#endif //U8_IOHANDLETHEN_H
