//
// Created by Dmitriy Tairov on 12.01.19.
//

#ifndef U8_ASYNCIO_H
#define U8_ASYNCIO_H

#include <uv.h>
#include <vector>
#include <functional>
#include <memory>

namespace asyncio {
    /**
     * Exit handle for deinitialize main asynchronously loop
     */
    extern uv_async_t exitHandle;

    /**
     * Handle of main asynchronously loop
     */
    extern uv_loop_t* asyncLoop;

    /**
     * Asynchronously request
     */
    typedef uv_fs_t ioHandle;

    /**
     * Byte vector
     */
    typedef std::vector<uint8_t> byte_vector;

    /**
     * File open callback
     *
     * @param result is file open result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(ssize_t result)> openFile_cb;

    /**
     * File read callback
     *
     * @param data is byte vector with data read from file
     * @param result is reading result from file
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(const byte_vector& data, ssize_t result)> readFile_cb;

    /**
     * File write callback
     *
     * @param result is file write result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes wrote.
     */
    typedef std::function<void(ssize_t result)> writeFile_cb;

    /**
     * File close callback
     *
     * @param result is file close result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is closed.
     */
    typedef std::function<void(ssize_t result)> closeFile_cb;

    struct openFile_data {
        openFile_cb callback;
        ioHandle* fileReq;
    };

    struct readFile_data {
        readFile_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
        size_t pos;
        size_t maxBytes;
        std::shared_ptr<byte_vector> data;
    };

    struct writeFile_data {
        writeFile_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
    };

    struct closeFile_data {
        closeFile_cb callback;
        ioHandle* fileReq;
    };

    /**
     * Init and run main asynchronously loop.
     * Must be called before asynchronous method calls.
     */
    uv_loop_t* initAndRunLoop();

    /**
     * Init and run auxiliary asynchronously loop.
     *
     * @param ploop_exitHandle is pointer to exit handle for deinitialize auxiliary asynchronously loop
     * @return handle of auxiliary asynchronously loop
     */
    uv_loop_t* initAndRunAuxLoop(uv_async_t** ploop_exitHandle);

    /**
     * Get handle of main asynchronously loop
     */
    inline uv_loop_t* getMainLoop() { return asyncLoop; };

    /**
     * Deinitialize main asynchronously loop.
     * Must be called after asynchronous method calls.
     */
    void deinitLoop();

    /**
     * Deinitialize auxiliary asynchronously loop.
     * Must be called after asynchronous method calls in auxiliary asynchronously loop.
     *
     * @param loop is handle of auxiliary asynchronously loop
     * @param loop_exitHandle is exit handle for deinitialize auxiliary asynchronously loop
     */
    void deinitAuxLoop(uv_loop_t* loop, uv_async_t* loop_exitHandle);

    /**
     * Check result for error
     *
     * @param result from asynchronously callback
     * @return true - if an error occurred
     *         false - if the result is successful
     */
    bool isError(ssize_t result);

    /**
     * Get error description by result.
     * isError(result) must be returned true.
     *
     * @param code is result from asynchronously callback
     * @return error description
     */
    const char* getError(ssize_t code);

    /**
     * Class for asynchronous work with files.
     */
    class IOHandle {
    public:
        IOHandle();
        ~IOHandle();

        /**
         * Asynchronously open file.
         *
         * @param path to open file
         * @param flags:
         *    O_RDONLY - open file read only
         *    O_WRONLY - open file write only
         *    O_RDWR - open file for reading and writing
         *    O_CREAT - if path does not exist, create it as a regular file
         *    O_TRUNC - if the file already exists and is a regular file and the
                        access mode allows writing (i.e., is O_RDWR or O_WRONLY) it
                        will be truncated to length 0.
         *    O_APPEND - file is opened in append mode
         * @param mode - specifies the file mode bits be applied when a new file is created:
         *    S_IRWXU  00700 user (file owner) has read, write, and execute permission
         *    S_IRUSR  00400 user has read permission
         *    S_IWUSR  00200 user has write permission
         *    S_IXUSR  00100 user has execute permission
         *    S_IRWXG  00070 group has read, write, and execute permission
         *    S_IRGRP  00040 group has read permission
         *    S_IWGRP  00020 group has write permission
         *    S_IXGRP  00010 group has execute permission
         *    S_IRWXO  00007 others have read, write, and execute permission
         *    S_IROTH  00004 others have read permission
         *    S_IWOTH  00002 others have write permission
         *    S_IXOTH  00001 others have execute permission
         * @param callback caused when opening a file or error
         */
        void open(const char* path, int flags, int mode, openFile_cb callback);

        /**
         * Asynchronously read file.
         *
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @param callback caused when reading a file or error
         */
        void read(size_t maxBytesToRead, readFile_cb callback);

        /**
         * Asynchronously write file.
         *
         * @param data is byte vector for data written to file
         * @param callback caused when writing a file or error
         */
        void write(const byte_vector& data, writeFile_cb callback);

        /**
         * Asynchronously close file.
         *
         * @param callback caused when closing a file or error
         */
        void close(closeFile_cb callback);

    private:
        uv_fs_t* ioReq;
        bool closed = false;

        void initRequest();
        void freeRequest();

        static void open_cb(asyncio::ioHandle *req);
        static void read_cb(asyncio::ioHandle *req);
        static void write_cb(asyncio::ioHandle *req);
        static void close_cb(asyncio::ioHandle *req);
    };

    typedef std::function<void(std::shared_ptr<IOHandle> handle, ssize_t result)> openIOHandle_cb;

    class file {
    public:
        /**
         * Max size of file for readFile and writeFile
         */
        static const unsigned int MAX_FILE_SIZE = 10485760;

        /**
         * Asynchronously opening of a file with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param flags (see IOHandle::open)
         * @param mode - specifies the file mode bits be applied when a new file is created (see IOHandle::open)
         * @param callback caused when opening a file or error
         */
        static void open(const char* path, int flags, int mode, openIOHandle_cb callback);

        /**
         * Asynchronously opening of a file for reading with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param callback caused when opening a file or error
         */
        static void openRead(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronously opening of a file for writing with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param callback caused when opening a file or error
         */
        static void openWrite(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronously open and read the entire contents of the file.
         *
         * @param path to open file
         * @param callback when the file is read or an error occurs
         */
        static void readFile(const char* path, readFile_cb callback);

        /**
         * Asynchronously open and read the part of the file.
         *
         * @param path to open file
         * @param pos is starting position in the file for reading
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @param callback when the part of the file is read or an error occurs
         */
        static void readFilePart(const char* path, size_t pos, size_t maxBytesToRead, readFile_cb callback);

        /**
         * Asynchronously open and write the file.
         *
         * @param path to open file
         * @param data is byte vector for data written to file         *
         * @param callback when the file is wrote or an error occurs
         */
        static void writeFile(const char* path, const byte_vector& data, writeFile_cb callback);

    private:
        static void readFile_onClose(asyncio::ioHandle *req);
        static void readFile_onRead(asyncio::ioHandle *req);
        static void readFile_onStat(asyncio::ioHandle *req);
        static void readFile_onOpen(asyncio::ioHandle *req);

        static void writeFile_onClose(asyncio::ioHandle *req);
        static void writeFile_onWrite(asyncio::ioHandle *req);
        static void writeFile_onOpen(asyncio::ioHandle *req);
    };
};

#endif //U8_ASYNCIO_H
