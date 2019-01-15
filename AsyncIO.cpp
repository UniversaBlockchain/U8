//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;

    uv_loop_t* initAndRunLoop() {
        if (!asyncLoop) {
            asyncLoop = uv_loop_new();
            //Opened async handle will keep the loop alive
            std::thread thread_loop([](){
                uv_async_init(asyncLoop, &exitHandle, [](uv_async_t* asyncHandle){
                    uv_close((uv_handle_t*) &exitHandle, nullptr);
                });
                uv_run(asyncLoop, UV_RUN_DEFAULT);
            });
            thread_loop.detach();
        }

        return asyncLoop;
    }

    void deinitLoop() {
        if (asyncLoop) {
            uv_async_send(&exitHandle);
            uv_loop_close(asyncLoop);
            asyncLoop = nullptr;
        }
    }

    uv_loop_t* initAndRunAuxLoop(uv_async_t** ploop_exitHandle) {
        uv_loop_t* loop = uv_loop_new();
        uv_async_t* loop_exitHandle = new uv_async_t();
        //Opened async handle will keep the loop alive
        std::thread thread_loop([loop, loop_exitHandle](){
            uv_async_init(loop, loop_exitHandle, [](uv_async_t* asyncHandle){
                uv_close((uv_handle_t*) asyncHandle, nullptr);
            });
            uv_run(loop, UV_RUN_DEFAULT);
        });
        thread_loop.detach();

        *ploop_exitHandle = loop_exitHandle;

        return loop;
    }

    void deinitAuxLoop(uv_loop_t* loop, uv_async_t* loop_exitHandle) {
        if (loop && loop_exitHandle) {
            uv_async_send(loop_exitHandle);
            uv_loop_close(loop);
            delete loop_exitHandle;
        }
    }

    IOHandle::IOHandle() {
        ioReq = nullptr;
        isOpenHandle = false;
    }

    IOHandle::IOHandle(ioHandle *req) {
        ioReq = req;
        isOpenHandle = false;
    }

    IOHandle::~IOHandle() {
        free();
    }

    void IOHandle::free() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }
    }

    void IOHandle::initRequest() {
        if (!ioReq)
            ioReq = new ioHandle();
    }

    void IOHandle::setRequestData(void* data) {
        initRequest();

        ioReq->data = data;
    }

    ioHandle* IOHandle::getRequest() {
        return ioReq;
    }

    bool IOHandle::isOpen() {
        return isOpenHandle;
    }

    ioHandle* IOHandle::open(const char* path, int flags, int mode, ioCallback callback, void* requestData) {
        initRequest();

        isOpenHandle = true;

        if (requestData)
            ioReq->data = requestData;

        int result = uv_fs_open(asyncio::asyncLoop, ioReq, path, flags, mode, callback);

        if (result) {
            fprintf(stderr, "Error at opening file: %s\n", uv_strerror(result));

            free();
            return nullptr;
        }

        return ioReq;
    }

    ioHandle* IOHandle::read(ioBuffer* buffer, ioCallback callback, void* requestData) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for reading.\n");
            return nullptr;
        }

        if (!isOpenHandle) {
            fprintf(stderr, "IOHandle is not open handle. Open new handle for file.\n");
            return nullptr;
        }

        ioHandle *req = new ioHandle();

        if (requestData)
            req->data = requestData;

        int result = uv_fs_read(asyncio::asyncLoop, req, (uv_file) ioReq->result, buffer, 1, -1, callback);

        if (result) {
            fprintf(stderr, "Error at reading file: %s\n", uv_strerror(result));
            return nullptr;
        }

        return req;
    }

    ioHandle* IOHandle::write(ioBuffer* buffer, ioCallback callback, void* requestData) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for writing.\n");
            return nullptr;
        }

        if (!isOpenHandle) {
            fprintf(stderr, "IOHandle is not open handle. Open new handle for file.\n");
            return nullptr;
        }

        ioHandle *req = new ioHandle();

        if (requestData)
            req->data = requestData;

        int result = uv_fs_write(asyncio::asyncLoop, req, (uv_file) ioReq->result, buffer, 1, -1, callback);

        if (result) {
            fprintf(stderr, "Error at writing file: %s\n", uv_strerror(result));
            return nullptr;
        }

        return req;
    }

    ioHandle* IOHandle::close(ioCallback callback, void* requestData) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file first.\n");
            return nullptr;
        }

        if (!isOpenHandle) {
            fprintf(stderr, "IOHandle is not open handle. Open new handle for file.\n");
            return nullptr;
        }

        ioHandle *req = new ioHandle();

        if (requestData)
            req->data = requestData;

        int result = uv_fs_close(asyncio::asyncLoop, req, (uv_file) ioReq->result, callback);

        if (result) {
            fprintf(stderr, "Error at closing file: %s\n", uv_strerror(result));
            return nullptr;
        }

        return req;
    }

    void file::readFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        readFile_data* file_data = (readFile_data*) req->data;
        ssize_t result = 0;

        if (req->result < 0)
            result = req->result;
        if (file_data->result < 0)
            result = file_data->result;

        file_data->callback(file_data->uvBuff.base, file_data->uvBuff.len, result);

        delete file_data->fileReq;
        delete file_data;
        delete req;
    }

    void file::readFile_onRead(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        readFile_data* file_data = (readFile_data*) req->data;

        ioHandle *closeReq = new ioHandle();
        file_data->result = req->result;
        closeReq->data = req->data;

        uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, readFile_onClose);

        delete req;
    }

    void file::readFile_onStat(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        readFile_data* file_data = (readFile_data*) req->data;
        uint64_t fileSize = req->statbuf.st_size;

        if ((req->result < 0) || (fileSize == 0) || (fileSize > MAX_FILE_SIZE)) {
            ioHandle *closeReq = new ioHandle();
            file_data->uvBuff.len = fileSize;
            file_data->result = req->result;
            closeReq->data = req->data;

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, readFile_onClose);
        } else {
            file_data->uvBuff = uv_buf_init((char*) malloc(fileSize), (unsigned int) fileSize);

            ioHandle *readReq = new ioHandle();
            readReq->data = req->data;

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, &file_data->uvBuff, 1, -1, readFile_onRead);
        }

        delete req;
    }

    void file::readFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        if (req->result < 0) {
            readFile_data* file_data = (readFile_data*) req->data;

            file_data->callback(nullptr, 0, req->result);

            delete file_data;
            delete req;
        } else {
            ioHandle *statReq = new ioHandle();
            statReq->data = req->data;

            uv_fs_fstat(asyncio::asyncLoop, statReq, (uv_file) req->result, readFile_onStat);
        }
    }

    void file::writeFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        writeFile_data* file_data = (writeFile_data*) req->data;
        ssize_t result = 0;

        if (req->result < 0)
            result = req->result;
        if (file_data->result < 0)
            result = file_data->result;

        file_data->callback(result);

        delete file_data->fileReq;
        delete file_data;
        delete req;
    }

    void file::writeFile_onWrite(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        writeFile_data* file_data = (writeFile_data*) req->data;

        ioHandle *closeReq = new ioHandle();
        file_data->result = req->result;
        closeReq->data = req->data;

        uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((writeFile_data*) req->data)->fileReq->result, writeFile_onClose);

        delete req;
    }

    void file::writeFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        writeFile_data* file_data = (writeFile_data*) req->data;

        if (req->result < 0) {
            file_data->callback(req->result);

            delete file_data;
            delete req;
        } else {
            ioHandle *writeReq = new ioHandle();
            writeReq->data = req->data;

            uv_fs_write(asyncio::asyncLoop, writeReq, (uv_file) req->result, &file_data->uvBuff, 1, -1, writeFile_onWrite);
        }
    }

    int file::readFile(const char* path, readFile_cb callback) {
        ioHandle *req = new ioHandle();
        readFile_data *file_data = new readFile_data();

        file_data->callback = callback;
        file_data->fileReq = req;
        file_data->uvBuff.base = nullptr;
        file_data->uvBuff.len = 0;
        file_data->result = 0;

        req->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, req, path, O_RDONLY, 0, readFile_onOpen);

        if (result) {
            delete req;
            delete file_data;
        }

        return result;
    }

    int file::writeFile(const char* path, void* data, size_t len, writeFile_cb callback) {
        ioHandle *req = new ioHandle();
        writeFile_data *file_data = new writeFile_data();

        file_data->callback = callback;
        file_data->fileReq = req;
        file_data->uvBuff.base = (char*) data;
        file_data->uvBuff.len = len;
        file_data->result = 0;

        req->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, req, path, O_CREAT | O_WRONLY | O_TRUNC, S_IRWXU | S_IRWXG | S_IRWXO, writeFile_onOpen);

        if (result) {
            delete req;
            delete file_data;
        }

        return result;
    }
};