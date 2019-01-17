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
    }

    IOHandle::~IOHandle() {
        freeRequest();
    }

    void IOHandle::freeRequest() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }
    }

    void IOHandle::initRequest() {
        if (!ioReq)
            ioReq = new ioHandle();
        else if (closed) {
            freeRequest();
            ioReq = new ioHandle();
        }
    }

    void IOHandle::open(const char* path, int flags, int mode, openFile_cb callback) {
        initRequest();

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, ioReq, path, flags, mode, open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            freeRequest();
        }
    }

    void IOHandle::read(uint maxBytesToRead, readFile_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for reading.\n");
            return;
        }

        auto req = new ioHandle();
        auto file_data = new readFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->data = std::make_shared<byte_vector>(maxBytesToRead);
        file_data->uvBuff = uv_buf_init((char*) file_data->data->data(), (unsigned int) maxBytesToRead);

        req->data = file_data;

        int result = uv_fs_read(asyncio::asyncLoop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, read_cb);

        if (result < 0) {
            file_data->callback(byte_vector(), result);

            free(file_data->uvBuff.base);
            delete file_data;
            delete req;
        }
    }

    void IOHandle::write(const byte_vector& data, writeFile_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for writing.\n");
            return;
        }

        auto req = new ioHandle();
        auto file_data = new writeFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->uvBuff = uv_buf_init((char*) data.data(), (unsigned int) data.size());

        req->data = file_data;

        int result = uv_fs_write(asyncio::asyncLoop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, write_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void IOHandle::close(closeFile_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file first.\n");
            return;
        }

        auto req = new ioHandle();
        auto file_data = new closeFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        req->data = file_data;

        int result = uv_fs_close(asyncio::asyncLoop, req, (uv_file) ioReq->result, close_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
        else
            closed = true;
    }

    void IOHandle::open_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
    }

    void IOHandle::read_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (readFile_data*) req->data;

        byte_vector data;
        data.assign(file_data->uvBuff.base, file_data->uvBuff.base + file_data->uvBuff.len);

        file_data->callback(*file_data->data, req->result);

        file_data->data.reset();
        delete file_data;
        delete req;
    }

    void IOHandle::write_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (writeFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOHandle::close_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (closeFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void file::readFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        readFile_data* file_data = (readFile_data*) req->data;
        ssize_t result = 0;

        if (req->result < 0)
            result = req->result;
        if (file_data->result < 0)
            result = file_data->result;

        file_data->callback(*file_data->data, result);

        file_data->data.reset();
        delete file_data->fileReq;
        delete file_data;
        delete req;
    }

    void file::readFile_onRead(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        readFile_data* file_data = (readFile_data*) req->data;

        ioHandle* closeReq = new ioHandle();
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
            ioHandle* closeReq = new ioHandle();
            file_data->uvBuff.len = fileSize;
            file_data->result = req->result;
            closeReq->data = req->data;

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, readFile_onClose);
        } else {
            file_data->data = std::make_shared<byte_vector>(fileSize);
            file_data->uvBuff = uv_buf_init((char*) file_data->data->data(), (unsigned int) fileSize);

            ioHandle* readReq = new ioHandle();
            readReq->data = req->data;

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, &file_data->uvBuff, 1, -1, readFile_onRead);
        }

        delete req;
    }

    void file::readFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        if (req->result < 0) {
            readFile_data* file_data = (readFile_data*) req->data;

            file_data->callback(byte_vector(), req->result);

            delete file_data;
            delete req;
        } else {
            ioHandle* statReq = new ioHandle();
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

        ioHandle* closeReq = new ioHandle();
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
            ioHandle* writeReq = new ioHandle();
            writeReq->data = req->data;

            uv_fs_write(asyncio::asyncLoop, writeReq, (uv_file) req->result, &file_data->uvBuff, 1, -1, writeFile_onWrite);
        }
    }

    int file::readFile(const char* path, readFile_cb callback) {
        ioHandle* req = new ioHandle();
        readFile_data* file_data = new readFile_data();

        file_data->callback = std::move(callback);
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

    int file::writeFile(const char* path, const byte_vector& data, writeFile_cb callback) {
        ioHandle* req = new ioHandle();
        writeFile_data* file_data = new writeFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = req;
        file_data->uvBuff.base = (char*) data.data();
        file_data->uvBuff.len = data.size();
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