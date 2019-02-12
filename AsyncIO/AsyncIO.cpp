//
// Created by Dmitriy Tairov on 12.01.19.
//

#include "AsyncIO.h"
#include <thread>

namespace asyncio {

    uv_loop_t* asyncLoop = nullptr;
    uv_async_t exitHandle;
    uv_async_t alarmHandle;
    uv_thread_t thread_loop;

    //===========================================================================================
    // Main functions implementation
    //===========================================================================================

    ioLoop* initAndRunLoop() {

        umask(000);

        if (!asyncLoop) {
            asyncLoop = uv_loop_new();

            //Opened async handle will keep the loop alive
            uv_async_init(asyncLoop, &exitHandle, [](uv_async_t* asyncHandle){
                uv_close((uv_handle_t*) &alarmHandle, nullptr);
                uv_close((uv_handle_t*) &exitHandle, nullptr);
            });

            uv_async_init(asyncLoop, &alarmHandle, [](uv_async_t* asyncHandle){});

            uv_thread_create(&thread_loop, [](void *arg){
                uv_loop_t* loop = asyncLoop;

                uv_run(loop, UV_RUN_DEFAULT);

                uv_walk(loop, [](uv_handle_t* handle, void* data){
                    uv_close(handle, nullptr);
                }, nullptr);
                uv_run(loop, UV_RUN_DEFAULT);
                uv_loop_close(loop);

                asyncLoop = nullptr;
            }, nullptr);

            //wait for init loop
            nanosleep((const struct timespec[]){{0, WAIT_LOOP}}, nullptr);
        }

        return asyncLoop;
    }

    void alarmLoop() {
        uv_async_send(&alarmHandle);
    }

    void deinitLoop() {
        if (asyncLoop) {
            uv_async_send(&exitHandle);
            //uv_thread_join(&thread_loop);
        }
    }

    ioLoop* initAndRunAuxLoop() {

        umask(000);

        uv_loop_t* loop = uv_loop_new();
        uv_async_t* loop_exitHandle = new uv_async_t();
        uv_async_t* loop_alarmHandle = new uv_async_t();
        uv_thread_t* thread_auxLoop = new uv_thread_t();

        auto loop_data = new auxLoop_data();
        loop_data->loop_exitHandle = loop_exitHandle;
        loop_data->loop_alarmHandle = loop_alarmHandle;
        loop_data->thread_auxLoop = thread_auxLoop;

        loop->data = loop_data;

        loop_exitHandle->data = (void*) loop_alarmHandle;

        //Opened async handle will keep the loop alive
        uv_async_init(loop, loop_exitHandle, [](uv_async_t* asyncHandle){
            if (asyncHandle->data)
                uv_close((uv_handle_t*) asyncHandle->data, [](uv_handle_t* handle){
                    delete handle;
                });
            uv_close((uv_handle_t*) asyncHandle, [](uv_handle_t* handle){
                delete handle;
            });
        });

        uv_async_init(loop, loop_alarmHandle, [](uv_async_t* asyncHandle){});

        uv_thread_create(thread_auxLoop, [](void *arg){

            uv_run((uv_loop_t*) arg, UV_RUN_DEFAULT);

            uv_walk((uv_loop_t*) arg, [](uv_handle_t* handle, void* data){
                uv_close(handle, nullptr);
            }, nullptr);
            uv_run((uv_loop_t*) arg, UV_RUN_DEFAULT);
            uv_loop_close((uv_loop_t*) arg);

            auto l_data = (auxLoop_data*) ((uv_loop_t*) arg)->data;
            if (l_data) {
                delete l_data->thread_auxLoop;
                delete l_data;
            }
        }, (void*) loop);

        //wait for init loop
        nanosleep((const struct timespec[]){{0, WAIT_LOOP}}, nullptr);

        return loop;
    }

    void alarmAuxLoop(ioLoop* loop) {
        if (loop == asyncLoop) {
            alarmLoop();
            return;
        }

        auto loop_data = (auxLoop_data*) loop->data;

        if (loop_data)
            uv_async_send(loop_data->loop_alarmHandle);
    }

    void deinitAuxLoop(ioLoop* loop) {
        if (loop) {
            auto loop_data = (auxLoop_data*) loop->data;
            if (loop_data) {
                uv_async_send(loop_data->loop_exitHandle);
                //uv_thread_join(loop_data->thread_auxLoop);
            }
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

    IOHandle::IOHandle(ioLoop* loop) {
        this->loop = loop;
        ioReq = nullptr;
        ioUDPSoc = nullptr;
        ioTCPSoc = nullptr;
    }

    IOHandle::~IOHandle() {
        if (ioReq && (type == FILE) && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING---\n");
                freeRequest();
            });

        } else if (ioUDPSoc && ((type == UDP_SOCKET) || (type == UDP_SOCKET_ERROR)) && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING_UDP---\n");
                freeRequest();
            });

        } else if (ioTCPSoc && ((type == TCP_SOCKET_LISTEN) || (type == TCP_SOCKET_CONNECTED) || (type == TCP_SOCKET_ERROR)) && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING_TCP---\n");
                freeRequest();
            });

        } else
            freeRequest();
    }

    void IOHandle::freeRequest() {
        if (ioReq) {
            uv_fs_req_cleanup(ioReq);
            delete ioReq;
            ioReq = nullptr;
        }

        if (ioUDPSoc) {
            delete ioUDPSoc;
            ioUDPSoc = nullptr;
        }

        if (ioTCPSoc) {
            delete ioTCPSoc;
            ioTCPSoc = nullptr;
        }
    }

    bool IOHandle::initRequest() {
        if (!ioReq && !ioTCPSoc && !ioUDPSoc)
            ioReq = new ioHandle();
        else if (closed) {
            freeRequest();
            ioReq = new ioHandle();
        } else
            return false;

        return true;
    }

    bool IOHandle::initUDPSocket() {
        if (!ioReq && !ioTCPSoc && !ioUDPSoc)
            ioUDPSoc = new uv_udp_t();
        else if (closed) {
            freeRequest();
            ioUDPSoc = new uv_udp_t();
        } else
            return false;

        return true;
    }

    bool IOHandle::initTCPSocket() {
        if (!ioReq && !ioTCPSoc && !ioUDPSoc)
            ioTCPSoc = new uv_tcp_t();
        else if (closed) {
            freeRequest();
            ioTCPSoc = new uv_tcp_t();
        } else
            return false;

        return true;
    }

    void IOHandle::open(const char* path, int flags, int mode, openFile_cb callback) {
        if (!initRequest())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;
        type = FILE;

        int result = uv_fs_open(loop, ioReq, path, flags, mode, _open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            ioReq->data = nullptr;
            freeRequest();
        }
    }

    void IOHandle::read(size_t maxBytesToRead, read_cb callback) {
        if ((type != FILE) && (type != TCP_SOCKET_CONNECTED))
            throw std::logic_error("ERROR: IOHandle not file type or TCP socket type or not connected.");

        if ((type == FILE) && !ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open file for reading.");

        if ((type == TCP_SOCKET_CONNECTED) && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type == FILE) {
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

        } else if (type == TCP_SOCKET_CONNECTED) {
            //freeReadData();
            auto read_data = new readTCP_data();

            read_data->callback = std::move(callback);
            read_data->maxBytesToRead = maxBytesToRead;
            read_data->handle = this;

            if (readQueue.empty() && !tcpReading) {
                tcpReading = true;

                ioTCPSoc->data = read_data;

                int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

                if (result < 0) {
                    read_data->callback(byte_vector(), result);

                    delete read_data;
                    ioTCPSoc->data = nullptr;
                } else
                    alarmAuxLoop(loop);
            } else
                readQueue.push({read_data, false});
        }
    }

    void IOHandle::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if ((type != FILE) && (type != TCP_SOCKET_CONNECTED))
            throw std::logic_error("ERROR: IOHandle not file type or TCP socket type or not connected.");

        if ((type == FILE) && !ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open file for reading.");

        if ((type == TCP_SOCKET_CONNECTED) && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type == FILE) {
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

        } else if (type == TCP_SOCKET_CONNECTED) {
            //freeReadData();
            auto read_data = new readBufferTCP_data();

            read_data->callback = std::move(callback);
            read_data->buffer = buffer;
            read_data->maxBytesToRead = maxBytesToRead;
            read_data->handle = this;

            if (readQueue.empty() && !tcpReading) {
                tcpReading = true;

                ioTCPSoc->data = read_data;

                int result = uv_read_start((uv_stream_t*) ioTCPSoc, _allocBuffer_tcp_cb, _readBuffer_tcp_cb);

                if (result < 0) {
                    read_data->callback(result);

                    delete read_data;
                    ioTCPSoc->data = nullptr;
                } else
                    alarmAuxLoop(loop);
            } else
                readQueue.push({read_data, true});
        }
    }

    void IOHandle::checkReadQueue() {
        if (readQueue.empty()) {
            tcpReading = false;
            return;
        }

        auto tcp_read_data = readQueue.front();
        readQueue.pop();

        if (tcp_read_data.bufferized) {
            auto read_data = (readBufferTCP_data*) tcp_read_data.data;

            ioTCPSoc->data = read_data;

            int result = uv_read_start((uv_stream_t*) ioTCPSoc, _allocBuffer_tcp_cb, _readBuffer_tcp_cb);

            if (result < 0) {
                read_data->callback(result);

                delete read_data;
                ioTCPSoc->data = nullptr;
            } else
                alarmAuxLoop(loop);
        } else {
            auto read_data = (readTCP_data*) tcp_read_data.data;

            ioTCPSoc->data = read_data;

            int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

            if (result < 0) {
                read_data->callback(byte_vector(), result);

                delete read_data;
                ioTCPSoc->data = nullptr;
            } else
                alarmAuxLoop(loop);
        }
    }

    void IOHandle::write(const byte_vector& data, write_cb callback) {
        if ((type != FILE) && (type != TCP_SOCKET_CONNECTED))
            throw std::logic_error("ERROR: IOHandle not file type or TCP socket type or not connected.");

        if ((type == FILE) && !ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open file for writing.");

        if ((type == TCP_SOCKET_CONNECTED) && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type == FILE) {
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

        } else if (type == TCP_SOCKET_CONNECTED) {
            auto req = new uv_write_t();
            auto write_data = new writeTCP_data();

            write_data->callback = std::move(callback);
            write_data->req = req;
            write_data->data = std::make_shared<byte_vector>(data);
            write_data->uvBuff = uv_buf_init((char*) write_data->data->data(), (unsigned int) write_data->data->size());
            write_data->connReset = connReset;

            req->data = write_data;

            int result = uv_write(req, (uv_stream_t*) ioTCPSoc, &write_data->uvBuff, 1, _write_tcp_cb);

            if (result < 0) {
                write_data->callback(result);

                delete req;
                delete write_data;
            } else {
                connReset = false;

                alarmAuxLoop(loop);
            }
        }
    }

    void IOHandle::write(void* buffer, size_t size, write_cb callback) {
        if ((type != FILE) && (type != TCP_SOCKET_CONNECTED))
            throw std::logic_error("ERROR: IOHandle not file type or TCP socket type or not connected.");

        if ((type == FILE) && !ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open file for writing.");

        if ((type == TCP_SOCKET_CONNECTED) && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type == FILE) {
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

        } else if (type == TCP_SOCKET_CONNECTED) {
            auto req = new uv_write_t();
            auto write_data = new writeTCP_data();

            write_data->callback = std::move(callback);
            write_data->req = req;
            write_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);
            write_data->data = nullptr;
            write_data->connReset = connReset;

            req->data = write_data;

            int result = uv_write(req, (uv_stream_t*) ioTCPSoc, &write_data->uvBuff, 1, _write_tcp_cb);

            if (result < 0) {
                write_data->callback(result);

                delete write_data;
                delete req;
            } else {
                connReset = false;

                alarmAuxLoop(loop);
            }
        }
    }

    void IOHandle::close(close_cb callback) {
        if ((type != FILE) && (type != UDP_SOCKET) && (type != TCP_SOCKET_LISTEN) && (type != TCP_SOCKET_CONNECTED) &&
            (type != UDP_SOCKET_ERROR) && (type != TCP_SOCKET_ERROR))
            throw std::logic_error("ERROR: IOHandle not file or socket type.");

        if ((type == FILE) && !ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open file first.");

        if ((((type == UDP_SOCKET) || (type == UDP_SOCKET_ERROR)) && !ioUDPSoc) ||
            (((type == TCP_SOCKET_LISTEN) || (type == TCP_SOCKET_CONNECTED) || (type == TCP_SOCKET_ERROR)) && !ioTCPSoc))
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type == FILE) {
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

        } else {
            freeReadData();
            auto socket_data = new closeSocket_data();

            socket_data->callback = std::move(callback);
            socket_data->connReset = connReset;

            uv_handle_t* handle = ((type == UDP_SOCKET) || (type == UDP_SOCKET_ERROR)) ? (uv_handle_t*) ioUDPSoc : (uv_handle_t*) ioTCPSoc;

            if (handle->data && (type == TCP_SOCKET_LISTEN))
                delete (openTCP_data*) handle->data;

            handle->data = socket_data;

            closed = true;

            if (!uv_is_closing(handle)) {
                uv_close(handle, _close_handle_cb);

                alarmAuxLoop(loop);
            } else {
                socket_data->callback(connReset ? UV_ECONNRESET : 0);

                delete socket_data;
            }

            connReset = false;
        }
    }

    void IOHandle::_open_cb(asyncio::ioHandle *req) {
        auto file_data = (openFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        req->data = nullptr;
    }

    void IOHandle::_read_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (read_data*) req->data;

        if ((req->result > 0) && (req->result < file_data->maxBytes))
            file_data->data->resize((unsigned long) req->result);

        file_data->callback(*file_data->data, req->result);

        file_data->data.reset();
        delete file_data;
        delete req;
    }

    void IOHandle::_readBuffer_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (readBuffer_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOHandle::_write_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (write_data*) req->data;

        if (file_data->data)
            file_data->data.reset();

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    void IOHandle::_close_cb(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto file_data = (closeFile_data*) req->data;

        file_data->callback(req->result);

        delete file_data;
        delete req;
    }

    IOHandle* IOHandle::open(const char* path, int flags, int mode) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::logic_error("ERROR: Task already initialized.");

        std::packaged_task<void(openFile_cb callback)> newTask([handle, path, flags, mode](openFile_cb callback) {
            handle->open(path, flags, mode, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::then(openFile_cb callback) {
        if (!task.valid())
            throw std::logic_error("ERROR: Task is not initialized.");

        task(std::move(callback));

        task = std::packaged_task<void(openFile_cb callback)>();

        return this;
    }

    IOHandle* IOHandle::read(size_t maxBytesToRead) {
        IOHandle *handle = this;

        if (readTask.valid())
            throw std::logic_error("ERROR: Task already initialized.");

        std::packaged_task<void(read_cb callback)> newTask([handle, maxBytesToRead](read_cb callback) {
            handle->read(maxBytesToRead, callback);
        });

        readTask = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::then(read_cb callback) {
        if (!readTask.valid())
            throw std::logic_error("ERROR: Task is not initialized.");

        readTask(std::move(callback));

        readTask = std::packaged_task<void(read_cb callback)>();

        return this;
    }

    IOHandle* IOHandle::write(const byte_vector& data) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::logic_error("ERROR: Task already initialized.");

        std::packaged_task<void(write_cb callback)> newTask([handle, data](write_cb callback) {
            handle->write(data, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    IOHandle* IOHandle::close() {
        IOHandle *handle = this;

        if (task.valid())
            throw std::logic_error("ERROR: Task already initialized.");

        std::packaged_task<void(close_cb callback)> newTask([handle](close_cb callback) {
            handle->close(callback);
        });

        task = std::move(newTask);

        return handle;
    }

    void IOHandle::openDir(const char* path, openDir_cb callback) {
        if (!initRequest())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        auto file_data = new openFile_data();

        file_data->callback = std::move(callback);
        file_data->fileReq = ioReq;

        ioReq->data = file_data;
        type = DIRECTORY;

        int result = uv_fs_scandir(loop, ioReq, path, O_RDONLY, _open_cb);

        if (result < 0) {
            file_data->callback(result);

            delete file_data;
            ioReq->data = nullptr;
            freeRequest();
        }
    }

    bool IOHandle::next(ioDirEntry *entry) {
        if (!ioReq)
            throw std::logic_error("ERROR: IOHandle not initialized. Open directory for scan.");

        if (type != DIRECTORY)
            throw std::logic_error("ERROR: IOHandle not directory type.");

        return UV_EOF != uv_fs_scandir_next(ioReq, entry);
    }

    IOHandle* IOHandle::openDir(const char* path) {
        IOHandle *handle = this;

        if (task.valid())
            throw std::logic_error("ERROR: Task already initialized.");

        std::packaged_task<void(openDir_cb callback)> newTask([handle, path](openDir_cb callback) {
            handle->openDir(path, callback);
        });

        task = std::move(newTask);

        return handle;
    }

    // ~~~~~~~~~~~~~
    // UDP
    // ~~~~~~~~~~~~~

    bool IOHandle::isIPv4(const char *ip)
    {
        struct sockaddr_in sa;
        int result = inet_pton(AF_INET, ip, &(sa.sin_addr));
        if (result > 0)
            return true;

        result = inet_pton(AF_INET6, ip, &(sa.sin_addr));
        if (result > 0)
            return false;

        throw std::invalid_argument("Incorrect IP address");
    }

    void IOHandle::_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto rcv_data = (recv_data*) handle->data;

        rcv_data->data = std::make_shared<byte_vector>(suggested_size);
        *buf = uv_buf_init((char*) rcv_data->data->data(), (unsigned int) suggested_size);
    }

    void IOHandle::_allocBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto recv_data = (recvBuffer_data*) handle->data;

        *buf = uv_buf_init((char*) recv_data->buffer, (unsigned int) recv_data->maxBytesToRecv);
    }

    void IOHandle::_recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto rcv_data = (recv_data*) handle->data;

        if (!nread) {
            rcv_data->callback(0, byte_vector(), nullptr, 0);

            rcv_data->data.reset();
            return;
        }

        const char *ip;
        char ipv6[INET6_ADDRSTRLEN];
        unsigned short int port;
        if (addr->sa_family == AF_INET) {
            ip = inet_ntoa(((sockaddr_in*) addr)->sin_addr);
            port = ntohs(((sockaddr_in*) addr)->sin_port);
        } else if (addr->sa_family == AF_INET6) {
            inet_ntop(AF_INET6, &((sockaddr_in6*) addr)->sin6_addr, ipv6, INET6_ADDRSTRLEN);
            ip = ipv6;
            port = ntohs(((sockaddr_in6*) addr)->sin6_port);
        } else
            throw std::logic_error("Unknown socket address family");

        if ((nread > 0) && (nread < rcv_data->data->size()))
            rcv_data->data->resize((unsigned long) nread);

        rcv_data->callback(nread, *rcv_data->data, ip, port);

        rcv_data->data.reset();
    }

    void IOHandle::_recvBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto recv_data = (recvBuffer_data*) handle->data;

        if (!nread) {
            recv_data->callback(0, nullptr, 0);
            return;
        }

        const char *ip;
        char ipv6[INET6_ADDRSTRLEN];
        unsigned short int port;
        if (addr->sa_family == AF_INET) {
            ip = inet_ntoa(((sockaddr_in*) addr)->sin_addr);
            port = ntohs(((sockaddr_in*) addr)->sin_port);
        } else if (addr->sa_family == AF_INET6) {
            inet_ntop(AF_INET6, &((sockaddr_in6*) addr)->sin6_addr, ipv6, INET6_ADDRSTRLEN);
            ip = ipv6;
            port = ntohs(((sockaddr_in6*) addr)->sin6_port);
        } else
            throw std::logic_error("Unknown socket address family");

        recv_data->callback(nread, ip, port);
    }

    void IOHandle::_send_cb(uv_udp_send_t* req, int status) {
        auto snd_data = (send_data*) req->data;

        if (snd_data->data)
            snd_data->data.reset();

        snd_data->callback((status < 0) ? status : snd_data->uvBuff.len);

        delete snd_data;
        delete req;
    }

    void IOHandle::_close_handle_cb(uv_handle_t* handle) {
        auto socket_data = (closeSocket_data*) handle->data;

        socket_data->callback(socket_data->connReset ? UV_ECONNRESET : 0);

        delete socket_data;
    }

    int IOHandle::openUDP(const char* IP, unsigned int port) {
        if (!initUDPSocket())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        int result = uv_udp_init(loop, ioUDPSoc);
        if (result < 0) {
            freeRequest();
            return result;
        }

        sockaddr_in addr;
        sockaddr_in6 addr6;

        if (isIPv4(IP)) {
            uv_ip4_addr(IP, port, &addr);
            result = uv_udp_bind(ioUDPSoc, (const struct sockaddr*) &addr, 0);
        } else {
            uv_ip6_addr(IP, port, &addr6);
            result = uv_udp_bind(ioUDPSoc, (const struct sockaddr*) &addr6, 0);
        }

        if (result < 0)
            type = UDP_SOCKET_ERROR;
        else
            type = UDP_SOCKET;

        return result;
    }

    void IOHandle::recv(recv_cb callback) {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != UDP_SOCKET)
            throw std::logic_error("ERROR: IOHandle not UDP socket type.");

        freeReadData();

        auto rcv_data = new recv_data();

        rcv_data->callback = std::move(callback);

        ioUDPSoc->data = rcv_data;
        bufferized = false;

        int result = uv_udp_recv_start(ioUDPSoc, _alloc_cb, _recv_cb);

        if (result < 0) {
            rcv_data->callback(result, byte_vector(), nullptr, 0);

            delete rcv_data;
            ioUDPSoc->data = nullptr;
        } else
            alarmAuxLoop(loop);
    }

    void IOHandle::recv(void* buffer, size_t maxBytesToRecv, recvBuffer_cb callback) {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != UDP_SOCKET)
            throw std::logic_error("ERROR: IOHandle not UDP socket type.");

        freeReadData();

        auto recv_data = new recvBuffer_data();

        recv_data->callback = std::move(callback);
        recv_data->buffer = buffer;
        recv_data->maxBytesToRecv = maxBytesToRecv;

        ioUDPSoc->data = recv_data;
        bufferized = true;

        int result = uv_udp_recv_start(ioUDPSoc, _allocBuffer_cb, _recvBuffer_cb);

        if (result < 0) {
            recv_data->callback(result, nullptr, 0);

            delete recv_data;
            ioUDPSoc->data = nullptr;
        } else
            alarmAuxLoop(loop);
    }

    void IOHandle::send(const byte_vector& data, const char* IP, unsigned int port, send_cb callback) {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != UDP_SOCKET)
            throw std::logic_error("ERROR: IOHandle not UDP socket type.");

        auto req = new uv_udp_send_t();
        auto snd_data = new send_data();

        snd_data->callback = std::move(callback);
        snd_data->req = req;
        snd_data->data = std::make_shared<byte_vector>(data);
        snd_data->uvBuff = uv_buf_init((char*) snd_data->data->data(), (unsigned int) snd_data->data->size());

        req->data = snd_data;

        int result;
        if (isIPv4(IP)) {
            sockaddr_in addr;
            uv_ip4_addr(IP, port, &addr);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr, _send_cb);
        } else {
            sockaddr_in6 addr6;
            uv_ip6_addr(IP, port, &addr6);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr6, _send_cb);
        }

        if (result < 0) {
            snd_data->callback(result);

            delete snd_data;
            delete req;
        } else
            alarmAuxLoop(loop);
    }

    void IOHandle::send(void* buffer, size_t size, const char* IP, unsigned int port, send_cb callback) {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != UDP_SOCKET)
            throw std::logic_error("ERROR: IOHandle not UDP socket type.");

        auto req = new uv_udp_send_t();
        auto snd_data = new send_data();

        snd_data->callback = std::move(callback);
        snd_data->req = req;
        snd_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);
        snd_data->data = nullptr;

        req->data = snd_data;

        int result;
        if (isIPv4(IP)) {
            sockaddr_in addr;
            uv_ip4_addr(IP, port, &addr);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr, _send_cb);
        } else {
            sockaddr_in6 addr6;
            uv_ip6_addr(IP, port, &addr6);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr6, _send_cb);
        }

        if (result < 0) {
            snd_data->callback(result);

            delete snd_data;
            delete req;
        } else
            alarmAuxLoop(loop);
    }

    void IOHandle::stopRecv() {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if ((type != UDP_SOCKET) && (type != TCP_SOCKET_CONNECTED))
            throw std::logic_error("ERROR: IOHandle not UDP\\TCP socket type or not connected.");

        if (type == UDP_SOCKET)
            uv_udp_recv_stop(ioUDPSoc);

        if (type == TCP_SOCKET_CONNECTED)
            uv_read_stop((uv_stream_t*) ioTCPSoc);
    }

    // ~~~~~~~~~~~~~
    // TCP
    // ~~~~~~~~~~~~~

    void IOHandle::_listen_cb(uv_stream_t* stream, int result) {
        auto socket_data = (openTCP_data*) stream->data;

        socket_data->callback(result);
    }

    void IOHandle::_connect_cb(uv_connect_t* connect, int result) {
        auto socket_data = (connect_data*) connect->handle->data;

        connect->handle->data = nullptr;

        socket_data->callback(result);

        delete socket_data;
    }

    void IOHandle::_write_tcp_cb(uv_write_t* req, int status) {
        auto write_data = (writeTCP_data*) req->data;

        if (write_data->connReset)
            status = UV_ECONNRESET;

        if (write_data->data)
            write_data->data.reset();

        write_data->callback((status < 0) ? status : write_data->uvBuff.len);

        delete write_data;
        delete req;
    }

    void IOHandle::_alloc_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto rcv_data = (readTCP_data*) handle->data;

        size_t vector_size = suggested_size;
        if (vector_size > rcv_data->maxBytesToRead)
            vector_size = rcv_data->maxBytesToRead;

        rcv_data->data = std::make_shared<byte_vector>(vector_size);
        *buf = uv_buf_init((char*) rcv_data->data->data(), (unsigned int) vector_size);
    }

    void IOHandle::_allocBuffer_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto recv_data = (readBufferTCP_data*) handle->data;

        *buf = uv_buf_init((char*) recv_data->buffer, (unsigned int) recv_data->maxBytesToRead);
    }

    void IOHandle::_read_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop(stream);

        if (nread == UV_EOF)
            nread = 0;

        auto read_data = (readTCP_data*) stream->data;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            read_data->handle->setConnectionReset();
        }

        if ((nread > 0) && (nread < read_data->data->size()))
            read_data->data->resize((unsigned long) nread);

        read_data->callback(*read_data->data, nread);

        read_data->data.reset();

        IOHandle* handle = read_data->handle;

        delete read_data;

        handle->checkReadQueue();
    }

    void IOHandle::_readBuffer_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop(stream);

        if (nread == UV_EOF)
            nread = 0;

        auto read_data = (readBufferTCP_data*) stream->data;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            read_data->handle->setConnectionReset();
        }

        read_data->callback(nread);

        IOHandle* handle = read_data->handle;

        delete read_data;

        handle->checkReadQueue();
    }

    void IOHandle::openTCP(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections) {
        if (!initTCPSocket())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        auto socket_data = new openTCP_data();

        socket_data->callback = std::move(callback);

        ioTCPSoc->data = socket_data;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            freeRequest();
            return;
        }

        sockaddr_in addr;
        sockaddr_in6 addr6;

        if (isIPv4(IP)) {
            uv_ip4_addr(IP, port, &addr);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr, 0);
        } else {
            uv_ip6_addr(IP, port, &addr6);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr6, 0);
        }

        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            type = TCP_SOCKET_ERROR;
            return;
        }

        result = uv_listen((uv_stream_t *) ioTCPSoc, maxConnections, _listen_cb);

        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            type = TCP_SOCKET_ERROR;
        } else {
            type = TCP_SOCKET_LISTEN;
            alarmAuxLoop(loop);
        }
    }

    void IOHandle::connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback) {
        if (!initTCPSocket())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        auto socket_data = new connect_data();

        socket_data->callback = std::move(callback);

        ioTCPSoc->data = socket_data;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            freeRequest();
            return;
        }

        sockaddr_in addr;
        sockaddr_in6 addr6;

        if (isIPv4(bindIP)) {
            uv_ip4_addr(bindIP, bindPort, &addr);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr, 0);
        } else {
            uv_ip6_addr(bindIP, bindPort, &addr6);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr6, 0);
        }

        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            type = TCP_SOCKET_ERROR;
            return;
        }

        if (isIPv4(IP)) {
            uv_ip4_addr(IP, port, &addr);
            result = uv_tcp_connect(&ioConnection, ioTCPSoc, (const sockaddr*) &addr, _connect_cb);
        } else {
            uv_ip6_addr(IP, port, &addr6);
            result = uv_tcp_connect(&ioConnection, ioTCPSoc, (const sockaddr*) &addr6, _connect_cb);
        }

        if (result < 0) {
            socket_data->callback(result);

            delete socket_data;
            ioTCPSoc->data = nullptr;
            type = TCP_SOCKET_ERROR;
        } else {
            type = TCP_SOCKET_CONNECTED;
            alarmAuxLoop(loop);
        }
    }

    std::shared_ptr<IOHandle> IOHandle::accept(ssize_t* result) {
        if (!ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != TCP_SOCKET_LISTEN)
            throw std::logic_error("ERROR: IOHandle not TCP socket type or not listen.");

        std::shared_ptr<asyncio::IOHandle> client = std::make_shared<asyncio::IOHandle>(loop);

        int res = client->acceptFromListeningSocket(this);

        if (result)
            *result = res;

        return (res >= 0) ? client : nullptr;
    }

    int IOHandle::acceptFromListeningSocket(IOHandle* listenSocket) {
        if (!initTCPSocket())
            throw std::logic_error("ERROR: IOHandle already initialized. Close opened handle.");

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            freeRequest();

            return result;
        }

        result = uv_accept((uv_stream_t*) listenSocket->getTCPSocket(), (uv_stream_t*) ioTCPSoc);

        if (result < 0) {
            type = TCP_SOCKET_ERROR;
        } else {
            type = TCP_SOCKET_CONNECTED;
            alarmAuxLoop(loop);
        }

        return result;
    }

    int IOHandle::enableKeepAlive(unsigned int delay) {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("ERROR: IOHandle not TCP socket type or not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 1, delay);
    }

    int IOHandle::disableKeepAlive() {
        if (!ioUDPSoc && !ioTCPSoc)
            throw std::logic_error("ERROR: IOHandle not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("ERROR: IOHandle not TCP socket type or not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 0, 0);
    }

    void IOHandle::freeReadData() {
        if ((type == UDP_SOCKET) && (ioUDPSoc->data)) {
            if (bufferized)
                delete (recvBuffer_data*) ioUDPSoc->data;
            else
                delete (recv_data*) ioUDPSoc->data;

            ioUDPSoc->data = nullptr;
        }

        /*if ((type == TCP_SOCKET_CONNECTED) && (ioTCPSoc->data)) {
            if (bufferized)
                delete (readBufferTCP_data*) ioTCPSoc->data;
            else
                delete (readTCP_data*) ioTCPSoc->data;

            ioTCPSoc->data = nullptr;
        }*/
    }

    ioTCPSocket* IOHandle::getTCPSocket() {
        return ioTCPSoc;
    }

    void IOHandle::setConnectionReset() {
        connReset = true;
    }

    //===========================================================================================
    // Class file implementation
    //===========================================================================================

    void file::readFile_onClose(asyncio::ioHandle *req) {
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

    void file::readFile_onRead(asyncio::ioHandle *req) {
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

    void file::readFile_onStat(asyncio::ioHandle *req) {
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

    void file::readFile_onOpen(asyncio::ioHandle *req) {
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

    void file::writeFile_onClose(asyncio::ioHandle *req) {
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

    void file::writeFile_onWrite(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);

        auto file_data = (write_data*) req->data;

        auto closeReq = new ioHandle();
        file_data->result = req->result;
        closeReq->data = req->data;

        uv_fs_close(asyncio::asyncLoop, closeReq, (uv_file) ((write_data*) req->data)->fileReq->result, writeFile_onClose);

        delete req;
    }

    void file::writeFile_onOpen(asyncio::ioHandle *req) {
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

    void file::readFilePart_onTimeout(uv_timer_t* handle) {
        //TODO: possible interrupt current request
    }

    void file::stat_onStat(asyncio::ioHandle *req) {
        uv_fs_req_cleanup(req);
        auto st_data = (stat_data*) req->data;

        st_data->callback(req->statbuf, req->result);

        delete st_data;
        delete req;
    }

    void file::readFile(const char* path, read_cb callback) {
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

    void file::readFilePart(const char* path, size_t pos, size_t maxBytesToRead, read_cb callback,
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

    void file::writeFile(const char* path, const byte_vector& data, write_cb callback) {
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

    IOHandle* file::open(const char* path, int flags, int mode) {
        auto handle = new IOHandle();

        handle->open(path, flags, mode);

        return handle;
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

    void file::stat(const char* path, stat_cb callback) {
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

    void dir::stat(const char* path, stat_cb callback) {
        file::stat(path, callback);
    }
};
