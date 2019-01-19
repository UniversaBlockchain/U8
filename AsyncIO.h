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
    extern uv_async_t exitHandle;
    extern uv_loop_t* asyncLoop;

    typedef uv_fs_t ioHandle;
    typedef std::vector<uint8_t> byte_vector;

    typedef std::function<void(ssize_t result)> openFile_cb;
    typedef std::function<void(const byte_vector& data, ssize_t result)> readFile_cb;
    typedef std::function<void(ssize_t result)> writeFile_cb;
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

    uv_loop_t* initAndRunLoop();
    uv_loop_t* initAndRunAuxLoop(uv_async_t** ploop_exitHandle);

    inline uv_loop_t* getMainLoop() { return asyncLoop; };

    void deinitLoop();
    void deinitAuxLoop(uv_loop_t* loop, uv_async_t* loop_exitHandle);

    // error helpers
    bool isError(ssize_t result);
    const char* getError(ssize_t code);

    class IOHandle {
    public:
        IOHandle();
        ~IOHandle();

        void open(const char* path, int flags, int mode, openFile_cb callback);
        void read(size_t maxBytesToRead, readFile_cb callback);
        void write(const byte_vector& data, writeFile_cb callback);
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

    class file {
    public:
        static const unsigned int MAX_FILE_SIZE = 10485760;

        static void readFile(const char* path, readFile_cb callback);
        static void readFilePart(const char* path, size_t pos, size_t maxBytesToRead, readFile_cb callback);

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
