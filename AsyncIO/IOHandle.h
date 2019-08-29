/*
 * Copyright (c) 2019 Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_IOHANDLE_H
#define U8_IOHANDLE_H

#include "AsyncIO.h"

namespace asyncio {

    /**
     * Base IOHandle callback with returning result.
     * @see IOHandle::write_cb
     * @see IOHandle::readBuffer_cb
     * @see IOHandle::close_cb
     *
     * @param result of some IOHandle operation.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - operation completed successful.
     */
    typedef std::function<void(ssize_t result)> result_cb;

    /**
     * File or socket read callback.
     *
     * @param data is byte vector with data read from file or socket.
     * @param result is reading result from file or socket.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(const byte_vector& data, ssize_t result)> read_cb;

    /**
     * File or socket read callback with initialized buffer.
     *
     * @param result is reading result from file or socket.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(ssize_t result)> readBuffer_cb;

    /**
     * File or socket write callback.
     *
     * @param result is file or socket write result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes wrote.
     */
    typedef std::function<void(ssize_t result)> write_cb;

    /**
     * File or socket close callback.
     *
     * @param result is file close result (ignored for closing socket).
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is closed.
     */
    typedef std::function<void(ssize_t result)> close_cb;

    struct read_data {
        read_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
        size_t pos;
        size_t maxBytes;
        std::shared_ptr<byte_vector> data;
        uv_timer_t* timer;
        size_t block;
        size_t readed;
    };

    struct readBuffer_data {
        readBuffer_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
    };

    struct write_data {
        write_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
        std::shared_ptr<byte_vector> data;
    };

    struct closeFile_data {
        close_cb callback;
        ioHandle* fileReq;
    };

    /**
     * Interface for asynchronous work with files, directories and sockets.
     */
    class IOHandle {
    public:
        /**
         * Asynchronous read file or socket.
         *
         * @param maxBytesToRead is maximum number of bytes to read from file or socket.
         * @param callback caused when reading a file or socket or error.
         */
        virtual void read(size_t maxBytesToRead, read_cb callback) = 0;

        /**
         * Asynchronous read file or socket to initialized buffer.
         *
         * @param buffer is initialized buffer for read from file or socket, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from file or socket.
         * @param callback caused when reading a file or socket or error.
         */
        virtual void read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) = 0;

        /**
         * Asynchronous write file or socket.
         *
         * @param data is byte vector for data written to file or socket.
         * @param callback caused when writing a file or socket or error.
         */
        virtual void write(const byte_vector& data, write_cb callback) = 0;

        /**
         * Asynchronous write file or socket from buffer.
         *
         * @param buffer contains data written to file or socket.
         * @param size of buffer in bytes.
         * @param callback caused when writing a file or socket or error.
         */
        virtual void write(void* buffer, size_t size, write_cb callback) = 0;

        /**
         * Asynchronous close file or socket.
         *
         * @param callback caused when closing a file/socket or error.
         */
        virtual void close(close_cb callback) = 0;
    };
}

#endif //U8_IOHANDLE_H
