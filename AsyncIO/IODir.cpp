/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "IODir.h"
#include "IOFile.h"

namespace asyncio {

    IODir::IODir(ioLoop* loop) {
        this->loop = loop;
        ioReq = nullptr;
    }

    IODir::~IODir() {
        freeRequest();
    }

    void IODir::freeRequest() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }
    }

    void IODir::initRequest() {
        if (!ioReq)
            ioReq = new ioHandle();
        else {
            freeRequest();
            ioReq = new ioHandle();
        }
    }

    void IODir::open(const char* path, openDir_cb callback) {
        initRequest();

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;

        int result = uv_fs_scandir(loop, ioReq, path, O_RDONLY, _open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            ioReq->data = nullptr;
            freeRequest();
        }
    }

    bool IODir::next(ioDirEntry *entry) {
        if (!ioReq)
            throw std::logic_error("IODir not initialized. Open directory for scan.");

        return UV_EOF != uv_fs_scandir_next(ioReq, entry);
    }

    IODir* IODir::prepareOpen(const char* path) {
        IODir *handle = this;

        if (task.valid())
            throw std::logic_error("Task already initialized.");

        std::packaged_task<void(openDir_cb callback)> newTask([handle, path](openDir_cb callback) {
            handle->open(path, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IODir* IODir::then(result_cb callback) {
        if (!task.valid())
            throw std::logic_error("Task is not initialized.");

        task(std::move(callback));

        task = std::packaged_task<void(result_cb callback)>();

        return this;
    }

    void IODir::_open_cb(asyncio::ioHandle *req) {
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        req->data = nullptr;
    }

    void IODir::dir_onCreateOrRemove(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto dir_data = (openFile_data*) req->data;

        dir_data->callback(req->result);

        delete dir_data;
        delete req;
    }

    void IODir::createDir(const char* path, int mode, createDir_cb callback) {
        auto req = new ioHandle();
        auto dir_data = new openFile_data();

        dir_data->callback = std::move(callback);
        dir_data->fileReq = req;

        req->data = dir_data;

        int result = uv_fs_mkdir(asyncio::asyncLoop, req, path, mode, dir_onCreateOrRemove);

        if (result < 0) {
            dir_data->callback(result);

            delete dir_data;
            delete req;
        }
    }

    void IODir::removeDir(const char* path, removeDir_cb callback) {
        auto req = new ioHandle();
        auto dir_data = new openFile_data();

        dir_data->callback = std::move(callback);
        dir_data->fileReq = req;

        req->data = dir_data;

        int result = uv_fs_rmdir(asyncio::asyncLoop, req, path, dir_onCreateOrRemove);

        if (result < 0) {
            dir_data->callback(result);

            delete dir_data;
            delete req;
        }
    }

    void IODir::stat(const char* path, stat_cb callback) {
        IOFile::stat(path, callback);
    }
}