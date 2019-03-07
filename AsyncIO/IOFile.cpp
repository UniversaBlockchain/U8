//
// Created by Tairov Dmitriy on 10.02.19.
//

#include "IOFile.h"

namespace asyncio {

    IOFile::IOFile(ioLoop* loop) {
        this->loop = loop;
        ioReq = nullptr;
    }

    IOFile::~IOFile() {
        if (ioReq && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING---\n");
                freeRequest();
            });

        } else
            freeRequest();
    }

    void IOFile::freeRequest() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }
    }

    bool IOFile::initRequest() {
        if (!ioReq)
            ioReq = new ioHandle();
        else if (closed) {
            freeRequest();
            ioReq = new ioHandle();
        } else
            return false;

        return true;
    }

    void IOFile::open(const char* path, int flags, int mode, openFile_cb callback) {
        if (!initRequest())
            throw std::logic_error("IOFile already initialized. Close opened file.");

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;

        int result = uv_fs_open(loop, ioReq, path, flags, mode, _open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            ioReq->data = nullptr;
            freeRequest();
        }
    }

    IOFile* IOFile::prepareOpen(const char* path, int flags, int mode) {
        IOFile *handle = this;

        if (task.valid())
            throw std::logic_error("Task already initialized.");

        std::packaged_task<void(openFile_cb callback)> newTask([handle, path, flags, mode](openFile_cb callback) {
            handle->open(path, flags, mode, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    void IOFile::read(size_t maxBytesToRead, read_cb callback) {
        if (!ioReq)
            throw std::logic_error("IOFile not initialized. Open file for reading.");

        auto req = new ioHandle();
        auto file_data = new read_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->data = std::make_shared<byte_vector>(maxBytesToRead);
        file_data->uvBuff = uv_buf_init((char*) file_data->data->data(), (unsigned int) maxBytesToRead);

        req->data = file_data;

        int result = uv_fs_read(loop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, _read_cb);

        if (result < 0) {
            file_data->callback(byte_vector(), result);

            delete file_data;
            delete req;
        }
    }

    void IOFile::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if (!ioReq)
            throw std::logic_error("IOFile not initialized. Open file for reading.");

        auto req = new ioHandle();
        auto file_data = new readBuffer_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) maxBytesToRead);

        req->data = file_data;

        int result = uv_fs_read(loop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, _readBuffer_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void IOFile::write(const byte_vector& data, write_cb callback) {
        if (!ioReq)
            throw std::logic_error("IOFile not initialized. Open file for writing.");

        auto req = new ioHandle();
        auto file_data = new write_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->data = std::make_shared<byte_vector>(data);
        file_data->uvBuff = uv_buf_init((char*) file_data->data->data(), (unsigned int) file_data->data->size());

        req->data = file_data;

        int result = uv_fs_write(loop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, _write_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void IOFile::write(void* buffer, size_t size, write_cb callback) {
        if (!ioReq)
            throw std::logic_error("IOFile not initialized. Open file for writing.");

        auto req = new ioHandle();
        auto file_data = new write_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;
        file_data->data = nullptr;
        file_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);

        req->data = file_data;

        int result = uv_fs_write(loop, req, (uv_file) ioReq->result, &file_data->uvBuff, 1, -1, _write_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
    }

    void IOFile::close(close_cb callback) {
        if (!ioReq)
            throw std::logic_error("IOFile not initialized. Open file first.");

        auto req = new ioHandle();
        auto file_data = new closeFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        req->data = file_data;

        int result = uv_fs_close(loop, req, (uv_file) ioReq->result, _close_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            delete req;
        }
        else
            closed = true;
    }

    void IOFile::_open_cb(asyncio::ioHandle *req) {
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        req->data = nullptr;
    }

    void IOFile::_read_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (read_data*) req->data;

        if ((req->result > 0) && (req->result < file_data->maxBytes))
            file_data->data->resize((unsigned long) req->result);

        file_data->callback(*file_data->data, req->result);

        file_data->data.reset();
        delete file_data;
        delete req;
    }

    void IOFile::_readBuffer_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (readBuffer_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOFile::_write_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (write_data*) req->data;

        if (file_data->data)
            file_data->data.reset();

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOFile::_close_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (closeFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOFile::readFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (read_data*) req->data;
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

    void IOFile::readFile_onRead(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (read_data*) req->data;

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

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((read_data*) req->data)->fileReq->result, readFile_onClose);
        } else {
            // Read next block
            size_t bufSize = file_data->block;
            if (file_data->readed + bufSize > file_data->data->size())
                bufSize = file_data->data->size() - file_data->readed;

            file_data->uvBuff = uv_buf_init((char*) file_data->data->data() + file_data->readed, (unsigned int) bufSize);

            auto readReq = new ioHandle();
            readReq->data = req->data;

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((read_data*) req->data)->fileReq->result,
                       &file_data->uvBuff, 1, (file_data->pos > 0) ? file_data->pos + file_data->readed : -1, readFile_onRead);
        }

        delete req;
    }

    void IOFile::readFile_onStat(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (read_data*) req->data;
        uint64_t fileSize = req->statbuf.st_size;

        if ((req->result < 0) || (fileSize == 0) || ((fileSize > MAX_FILE_SIZE) && (file_data->maxBytes == 0)) ||
            (file_data->pos >= fileSize)) {
            auto closeReq = new ioHandle();
            file_data->uvBuff.len = fileSize;
            file_data->result = req->result;
            closeReq->data = req->data;

            uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((read_data*) req->data)->fileReq->result, readFile_onClose);
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

            uv_fs_read(asyncio::asyncLoop, readReq, (uv_file) ((read_data*) req->data)->fileReq->result,
                       &file_data->uvBuff, 1, (file_data->pos > 0) ? file_data->pos : -1, readFile_onRead);
        }

        delete req;
    }

    void IOFile::readFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        if (req->result < 0) {
            auto file_data = (read_data*) req->data;

            file_data->callback(byte_vector(), req->result);

            delete file_data;
            delete req;
        } else {
            auto statReq = new ioHandle();
            statReq->data = req->data;

            uv_fs_fstat(asyncio::asyncLoop, statReq, (uv_file) req->result, readFile_onStat);
        }
    }

    void IOFile::writeFile_onClose(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (write_data*) req->data;
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

    void IOFile::writeFile_onWrite(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (write_data*) req->data;

        auto closeReq = new ioHandle();
        file_data->result = req->result;
        closeReq->data = req->data;

        uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((write_data*) req->data)->fileReq->result, writeFile_onClose);

        delete req;
    }

    void IOFile::writeFile_onOpen(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (write_data*) req->data;

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

    void IOFile::readFilePart_onTimeout(uv_timer_t* handle) {
        //TODO: possible interrupt current request
        uv_timer_stop(handle);

        uv_close((uv_handle_t*) handle, [](uv_handle_t* handle){
            delete handle;
        });
    }

    void IOFile::stat_onStat(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto st_data = (stat_data*) req->data;

        st_data->callback(req->statbuf, req->result);

        delete st_data;
        delete req;
    }

    void IOFile::readFile(const char* path, read_cb callback) {
        auto req = new ioHandle();
        auto file_data = new read_data();

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

    void IOFile::readFilePart(const char* path, size_t pos, size_t maxBytesToRead, read_cb callback,
                            unsigned int timeout, size_t blockSize) {
        if (maxBytesToRead == 0) {
            callback(byte_vector(), -1);
            return;
        }

        auto req = new ioHandle();
        auto file_data = new read_data();

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

    void IOFile::writeFile(const char* path, const byte_vector& data, write_cb callback) {
        auto req = new ioHandle();
        auto file_data = new write_data();

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

    void IOFile::open(const char* path, int flags, int mode, openIOFile_cb callback) {
        std::shared_ptr<IOFile> handle = std::make_shared<IOFile>();

        handle->open(path, flags, mode, [handle, callback](ssize_t result) {
            callback(handle, result);
        });
    }

    void IOFile::openRead(const char* path, openIOFile_cb callback) {
        open(path, O_RDONLY, 0, std::move(callback));
    }

    void IOFile::openWrite(const char* path, openIOFile_cb callback) {
        open(path, O_CREAT | O_WRONLY | O_TRUNC, S_IRWXU | S_IRWXG | S_IRWXO, std::move(callback));
    }

    void IOFile::remove_onRemoveFile(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOFile::remove(const char* path, removeFile_cb callback) {
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

    void IOFile::stat(const char* path, stat_cb callback) {
        auto req = new ioHandle();
        auto st_data = new stat_data();

        st_data->callback = std::move(callback);
        st_data->req = req;

        req->data = st_data;

        int result = uv_fs_stat(asyncio::asyncLoop, req, path, stat_onStat);

        if (result < 0) {
            st_data->callback(ioStat(), result);

            delete st_data;
            delete req;
        }
    }
}