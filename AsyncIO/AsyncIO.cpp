//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

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

    //===========================================================================================
    // Helpers implementation
    //===========================================================================================

    bool isError(ssize_t result) {
        return result < 0;
    }

    const char* getError(ssize_t code) {
        return uv_strerror(code);
    }

    bool isFile(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_FILE;
    }

    bool isDir(const ioDirEntry& entry) {
        return entry.type == UV_DIRENT_DIR;
    }

    //===========================================================================================
    // Class IOHandle implementation
    //===========================================================================================

    IOHandle::IOHandle() {
        ioReq = nullptr;
    }

    IOHandle::~IOHandle() {
        if (ioReq && (type == FILE) && !closed)
            close([](ssize_t result){
                //printf("---AUTO_CLOSING---\n");
            });

        freeRequest();
    }

    void IOHandle::freeRequest() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }
    }

    bool IOHandle::initRequest() {
        if (!ioReq)
            ioReq = new ioHandle();
        else if (closed) {
            freeRequest();
            ioReq = new ioHandle();
        } else
            return false;

        return true;
    }

    void IOHandle::open(const char* path, int flags, int mode, openFile_cb callback) {
        if (!initRequest()) {
            fprintf(stderr, "IOHandle already initialized. Close opened handle.\n");
            return;
        }

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;
        type = FILE;

        int result = uv_fs_open(asyncio::asyncLoop, ioReq, path, flags, mode, open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            freeRequest();
        }
    }

    void IOHandle::read(size_t maxBytesToRead, readFile_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for reading.\n");
            return;
        }

        if (type != FILE) {
            fprintf(stderr, "IOHandle not file type.\n");
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

            delete file_data;
            delete req;
        }
    }

    void IOHandle::read(void* buffer, size_t maxBytesToRead, readFileBuffer_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for reading.\n");
            return;
        }

        if (type != FILE) {
            fprintf(stderr, "IOHandle not file type.\n");
            return;
        }

        auto req = new ioHandle();
        auto file_data = new readFileBuffer_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) maxBytesToRead);

        req->data = file_data;

        int result = uv_fs_read(asyncio::asyncLoop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, readBuffer_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void IOHandle::write(const byte_vector& data, writeFile_cb callback) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open file for writing.\n");
            return;
        }

        if (type != FILE) {
            fprintf(stderr, "IOHandle not file type.\n");
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

        if (type != FILE) {
            fprintf(stderr, "IOHandle not file type.\n");
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
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
    }

    void IOHandle::read_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (readFile_data*) req->data;

        if ((req->result > 0) && (req->result < file_data->maxBytes))
            file_data->data->resize((unsigned long) req->result);

        file_data->callback(*file_data->data, req->result);

        file_data->data.reset();
        delete file_data;
        delete req;
    }

    void IOHandle::readBuffer_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (readFileBuffer_data*) req->data;

        file_data->callback(req->result);

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

    IOHandle* file::open(const char* path, int flags, int mode) {
        auto handle = new IOHandle();

        handle->open(path, flags, mode);

        return handle;
    }

    IOHandle* IOHandle::open(const char* path, int flags, int mode) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::invalid_argument("ERROR: Task already initialized.");

        std::packaged_task<void(openFile_cb callback)> newTask([handle, path, flags, mode](openFile_cb callback) {
            handle->open(path, flags, mode, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::then(openFile_cb callback) {
        if (!task.valid())
            throw std::invalid_argument("ERROR: Task is not initialized.");

        task(std::move(callback));

        task = std::packaged_task<void(openFile_cb callback)>();

        return this;
    }

    IOHandle* IOHandle::read(size_t maxBytesToRead) {
        IOHandle *handle = this;

        if (readTask.valid())
            throw std::invalid_argument("ERROR: Task already initialized.");

        std::packaged_task<void(readFile_cb callback)> newTask([handle, maxBytesToRead](readFile_cb callback) {
            handle->read(maxBytesToRead, callback);
        });

        readTask = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::then(readFile_cb callback) {
        if (!readTask.valid())
            throw std::invalid_argument("ERROR: Task is not initialized.");

        readTask(std::move(callback));

        readTask = std::packaged_task<void(readFile_cb callback)>();

        return this;
    }

    IOHandle* IOHandle::write(const byte_vector& data) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::invalid_argument("ERROR: Task already initialized.");

        std::packaged_task<void(writeFile_cb callback)> newTask([handle, data](writeFile_cb callback) {
            handle->write(data, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::close() {
        IOHandle *handle = this;

        if (task.valid())
            throw std::invalid_argument("ERROR: Task already initialized.");

        std::packaged_task<void(closeFile_cb callback)> newTask([handle](closeFile_cb callback) {
            handle->close(callback);
        });

        task = std::move(newTask);

        return handle;
    }

    void IOHandle::openDir(const char* path, openDir_cb callback) {
        if (!initRequest()) {
            fprintf(stderr, "IOHandle already initialized. Close opened handle.\n");
            return;
        }

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;
        type = DIRECTORY;

        int result = uv_fs_scandir(asyncio::asyncLoop, ioReq, path, O_RDONLY, open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            freeRequest();
        }
    }

    bool IOHandle::next(ioDirEntry *entry) {
        if (!ioReq) {
            fprintf(stderr, "IOHandle not initialized. Open directory for scan.\n");
            return false;
        }

        if (type != DIRECTORY) {
            fprintf(stderr, "IOHandle not directory type.\n");
            return false;
        }

        return UV_EOF != uv_fs_scandir_next(ioReq, entry);
    }

    IOHandle* IOHandle::openDir(const char* path) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::invalid_argument("ERROR: Task already initialized.");

        std::packaged_task<void(openDir_cb callback)> newTask([handle, path](openDir_cb callback) {
            handle->openDir(path, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    //===========================================================================================
    // Class file implementation
    //===========================================================================================

    void file::readFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (readFile_data*) req->data;
        ssize_t result = 0;

        if (file_data->timer)
            uv_timer_stop(file_data->timer);

        if (req->result < 0)
            result = req->result;
        else
            result = file_data->result;

        if ((result > 0) && (result < file_data->maxBytes))
            file_data->data->resize((unsigned long) result);

        file_data->callback(*file_data->data, result);

        file_data->data.reset();
        delete file_data->fileReq;
        delete file_data;
        delete req;
    }

    void file::readFile_onRead(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (readFile_data*) req->data;

        if (file_data->block > 0)
            file_data->readed += req->result;

        if ((file_data->block == 0) || (file_data->readed == file_data->data->size()) ||
            (file_data->timer && !uv_is_active((uv_handle_t*) file_data->timer))) {

            auto closeReq = new ioHandle();

            if (file_data->block > 0)
                file_data->result = file_data->readed;
            else
                file_data->result = req->result;
            closeReq->data = req->data;

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, readFile_onClose);
        } else {
            // Read next block
            size_t bufSize = file_data->block;
            if (file_data->readed + bufSize > file_data->data->size())
                bufSize = file_data->data->size() - file_data->readed;

            file_data->uvBuff = uv_buf_init((char*) file_data->data->data() + file_data->readed, (unsigned int) bufSize);

            auto readReq = new ioHandle();
            readReq->data = req->data;

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((readFile_data*) req->data)->fileReq->result,
                       &file_data->uvBuff, 1, (file_data->pos > 0) ? file_data->pos + file_data->readed : -1, readFile_onRead);
        }

        delete req;
    }

    void file::readFile_onStat(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (readFile_data*) req->data;
        uint64_t fileSize = req->statbuf.st_size;

        if ((req->result < 0) || (fileSize == 0) || ((fileSize > MAX_FILE_SIZE) && (file_data->maxBytes == 0)) ||
            (file_data->pos >= fileSize)) {
            auto closeReq = new ioHandle();
            file_data->uvBuff.len = fileSize;
            file_data->result = req->result;
            closeReq->data = req->data;

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((readFile_data*) req->data)->fileReq->result, readFile_onClose);
        } else {
            uint64_t bufSize = fileSize;
            if (file_data->maxBytes > 0) {
                bufSize = file_data->maxBytes;

                if (bufSize + file_data->pos > fileSize)
                    bufSize = fileSize - file_data->pos;
            }

            file_data->data = std::make_shared<byte_vector>(bufSize);

            if ((file_data->block > 0) && (bufSize > file_data->block)) {
                bufSize = file_data->block;
                file_data->readed = 0;
            }

            file_data->uvBuff = uv_buf_init((char*) file_data->data->data(), (unsigned int) bufSize);

            auto readReq = new ioHandle();
            readReq->data = req->data;

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((readFile_data*) req->data)->fileReq->result,
                    &file_data->uvBuff, 1, (file_data->pos > 0) ? file_data->pos : -1, readFile_onRead);
        }

        delete req;
    }

    void file::readFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        if (req->result < 0) {
            auto file_data = (readFile_data*) req->data;

            file_data->callback(byte_vector(), req->result);

            delete file_data;
            delete req;
        } else {
            auto statReq = new ioHandle();
            statReq->data = req->data;

            uv_fs_fstat(asyncio::asyncLoop, statReq, (uv_file) req->result, readFile_onStat);
        }
    }

    void file::writeFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (writeFile_data*) req->data;
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

        auto file_data = (writeFile_data*) req->data;

        auto closeReq = new ioHandle();
        file_data->result = req->result;
        closeReq->data = req->data;

        uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((writeFile_data*) req->data)->fileReq->result, writeFile_onClose);

        delete req;
    }

    void file::writeFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (writeFile_data*) req->data;

        if (req->result < 0) {
            file_data->callback(req->result);

            delete file_data;
            delete req;
        } else {
            auto writeReq = new ioHandle();
            writeReq->data = req->data;

            uv_fs_write(asyncio::asyncLoop, writeReq, (uv_file) req->result, &file_data->uvBuff, 1, -1, writeFile_onWrite);
        }
    }

    void file::readFilePart_onTimeout(uv_timer_t* handle) {
        //TODO: possible interrupt current request
    }

    void file::readFile(const char* path, readFile_cb callback) {
        auto req = new ioHandle();
        auto file_data = new readFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = req;
        file_data->uvBuff.base = nullptr;
        file_data->uvBuff.len = 0;
        file_data->result = 0;
        file_data->pos = 0;
        file_data->maxBytes = 0;

        req->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, req, path, O_RDONLY, 0, readFile_onOpen);

        if (result < 0) {
            file_data->callback(byte_vector(), result);

            delete file_data;
            delete req;
        }
    }

    void file::readFilePart(const char* path, size_t pos, size_t maxBytesToRead, readFile_cb callback,
            unsigned int timeout, size_t blockSize) {
        if (maxBytesToRead == 0) {
            callback(byte_vector(), -1);
            return;
        }

        auto req = new ioHandle();
        auto file_data = new readFile_data();

        if ((timeout > 0) && (blockSize > 0)) {
            file_data->timer = new uv_timer_t();

            uv_timer_init(asyncio::asyncLoop, file_data->timer);
            uv_timer_start(file_data->timer, readFilePart_onTimeout, timeout, 0);

            file_data->block = blockSize;
        } else {
            file_data->timer = nullptr;
            file_data->block = 0;
        }

        file_data->callback = std::move(callback);
        file_data->fileReq = req;
        file_data->uvBuff.base = nullptr;
        file_data->uvBuff.len = 0;
        file_data->result = 0;
        file_data->pos = pos;
        file_data->maxBytes = maxBytesToRead;

        req->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, req, path, O_RDONLY, 0, readFile_onOpen);

        if (result < 0) {
            file_data->callback(byte_vector(), result);

            delete file_data;
            delete req;
        }
    }

    void file::writeFile(const char* path, const byte_vector& data, writeFile_cb callback) {
        auto req = new ioHandle();
        auto file_data = new writeFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = req;
        file_data->uvBuff.base = (char*) data.data();
        file_data->uvBuff.len = data.size();
        file_data->result = 0;

        req->data = file_data;

        int result = uv_fs_open(asyncio::asyncLoop, req, path, O_CREAT | O_WRONLY | O_TRUNC, S_IRWXU | S_IRWXG | S_IRWXO, writeFile_onOpen);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void file::open(const char* path, int flags, int mode, openIOHandle_cb callback) {
        std::shared_ptr<IOHandle> handle = std::make_shared<IOHandle>();

        handle->open(path, flags, mode, [handle, callback](ssize_t result) {
            callback(handle, result);
        });
    }

    void file::openRead(const char* path, openIOHandle_cb callback) {
        open(path, O_RDONLY, 0, std::move(callback));
    }

    void file::openWrite(const char* path, openIOHandle_cb callback) {
        open(path, O_CREAT | O_WRONLY | O_TRUNC, S_IRWXU | S_IRWXG | S_IRWXO, std::move(callback));
    }

    void file::remove_onRemoveFile(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void file::remove(const char* path, removeFile_cb callback) {
        auto req = new ioHandle();
        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = req;

        req->data = file_data;

        int result = uv_fs_unlink(asyncio::asyncLoop, req, path, remove_onRemoveFile);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    //===========================================================================================
    // Class directory implementation
    //===========================================================================================

    void dir::dir_onCreateOrRemove(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto dir_data = (openFile_data*) req->data;

        dir_data->callback(req->result);

        delete dir_data;
        delete req;
    }

    void dir::createDir(const char* path, int mode, createDir_cb callback) {
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

    void dir::removeDir(const char* path, removeDir_cb callback) {
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
};