//
// Created by Dmitriy Tairov on 12.01.19.
//

#ifndef U8_ASYNCIO_H
#define U8_ASYNCIO_H

#include <uv.h>

namespace asyncio {
    extern uv_async_t exitHandle;
    extern uv_loop_t* asyncLoop;

    typedef uv_fs_t ioHandle;
    typedef uv_fs_cb ioCallback;
    typedef uv_buf_t ioBuffer;

    uv_loop_t* initAndRunLoop();

    inline uv_loop_t* getLoop() { return asyncLoop; };

    void deinitLoop();

    class IOHandle {
    public:
        IOHandle();
        IOHandle(ioHandle *req);

        ~IOHandle();
        void free();

        void initRequest();
        void setRequestData(void* data);
        ioHandle* getRequest();
        bool isOpen();

        ioHandle* open(const char* path, int flags, int mode, ioCallback callback, void* requestData = nullptr);
        ioHandle* read(ioBuffer* buffer, ioCallback callback, void* requestData = nullptr);
        ioHandle* write(ioBuffer* buffer, ioCallback callback, void* requestData = nullptr);
        ioHandle* close(ioCallback callback, void* requestData = nullptr);

    private:
        uv_fs_t* ioReq;
        bool isOpenHandle;
    };

    typedef void (*readFile_cb)(void* data, size_t len, ssize_t result);
    typedef void (*writeFile_cb)(ssize_t result);

    class file {
    public:
        static const unsigned int MAX_FILE_SIZE = 10485760;

        struct readFile_data {
            readFile_cb callback;
            ioHandle* fileReq;
            uv_buf_t uvBuff;
            ssize_t result;
        };

        struct writeFile_data {
            writeFile_cb callback;
            ioHandle* fileReq;
            uv_buf_t uvBuff;
            ssize_t result;
        };

        static int readFile(const char* path, readFile_cb callback);
        static int writeFile(const char* path, void* data, size_t len, writeFile_cb callback);

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
