/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "IOTCP.h"

namespace asyncio {

    IOTCP::IOTCP(AsyncLoop* loop) {
        if (!loop) {
            aloop = new AsyncLoop();
            ownLoop = true;
        } else {
            aloop = loop;
            ownLoop = false;
        }

        this->loop = aloop->getLoop();
        ioTCPSoc = nullptr;
    }

    IOTCP::~IOTCP() {
        if (ioTCPSoc && !closed) {
            uv_sem_t sem;
            uv_sem_init(&sem, 0);
            close([this,&sem](ssize_t result) {
                //printf("---AUTO_CLOSING_TCP---\n");
                freeRequest();

                if (ownLoop)
                    delete aloop;

                uv_sem_post(&sem);
            });
            uv_sem_wait(&sem);
            uv_sem_destroy(&sem);
        } else {
            freeRequest();

            if (ownLoop)
                delete aloop;
        }
    }

    void IOTCP::stopOwnLoop() {
        if (ownLoop)
            aloop->stop();
    }

    void IOTCP::freeRequest() {
        if (ioTCPSoc) {
            if (ioTCPSoc->data) {
                auto sockData = (TCPSocket_data*) ioTCPSoc->data;

                if (sockData->read) {
                    if (bufferized)
                        delete (readBufferTCP_data*) sockData->read;
                    else
                        delete (readTCP_data*) sockData->read;
                }

                delete sockData;
            }

            delete ioTCPSoc;
            ioTCPSoc = nullptr;
        }
    }

    bool IOTCP::initTCPSocket() {
        if (!ioTCPSoc)
            ioTCPSoc = new uv_tcp_t();
        else if (closed) {
            freeRequest();
            ioTCPSoc = new uv_tcp_t();
        } else
            return false;

        return true;
    }

    void IOTCP::read(size_t maxBytesToRead, read_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        auto read_data = new readTCP_data();

        read_data->callback = std::move(callback);
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;

        if (readQueue.empty() && !tcpReading) {
            tcpReading = true;
            bufferized = false;

            if (!ioTCPSoc->data) {
                auto sockData = new TCPSocket_data();
                sockData->read = sockData->close = nullptr;
                ioTCPSoc->data = sockData;
            }

            freeReadData();

            ((TCPSocket_data*) ioTCPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

                    if (result < 0) {
                        ((TCPSocket_data*) ioTCPSoc->data)->read = nullptr;

                        read_data->callback(byte_vector(), result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else
            readQueue.put({read_data, false});
    }

    void IOTCP::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        auto read_data = new readBufferTCP_data();

        read_data->callback = std::move(callback);
        read_data->buffer = buffer;
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;

        if (readQueue.empty() && !tcpReading) {
            tcpReading = true;
            bufferized = true;

            if (!ioTCPSoc->data) {
                auto sockData = new TCPSocket_data();
                sockData->read = sockData->close = nullptr;
                ioTCPSoc->data = sockData;
            }

            freeReadData();

            ((TCPSocket_data*) ioTCPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_read_start((uv_stream_t*) ioTCPSoc, _allocBuffer_tcp_cb, _readBuffer_tcp_cb);

                    if (result < 0) {
                        ((TCPSocket_data*) ioTCPSoc->data)->read = nullptr;

                        read_data->callback(result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else
            readQueue.put({read_data, true});
    }

    void IOTCP::checkReadQueue() {
        if (readQueue.empty()) {
            tcpReading = false;
            return;
        }

        if (((TCPSocket_data*) ioTCPSoc->data)->read)
            throw std::logic_error("Error deleting read data.");

        auto tcp_read_data = readQueue.get();

        bufferized = tcp_read_data.bufferized;
        if (bufferized) {
            auto read_data = (readBufferTCP_data*) tcp_read_data.data;

            ((TCPSocket_data*) ioTCPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_read_start((uv_stream_t*) ioTCPSoc, _allocBuffer_tcp_cb, _readBuffer_tcp_cb);

                    if (result < 0) {
                        ((TCPSocket_data*) ioTCPSoc->data)->read = nullptr;

                        read_data->callback(result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else {
            auto read_data = (readTCP_data*) tcp_read_data.data;

            ((TCPSocket_data*) ioTCPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

                    if (result < 0) {
                        ((TCPSocket_data*) ioTCPSoc->data)->read = nullptr;

                        read_data->callback(byte_vector(), result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        }
    }

    void IOTCP::write(const byte_vector& data, write_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (aloop)
            aloop->addWork([=]{
                _write(data, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTCP::_write(const byte_vector& data, write_cb callback) {
        auto req = new uv_write_t();
        auto write_data = new writeTCP_data();

        write_data->callback = std::move(callback);
        write_data->data = std::make_shared<byte_vector>(data);
        write_data->uvBuff = uv_buf_init((char*) write_data->data->data(), (unsigned int) write_data->data->size());
        write_data->connReset = connReset;

        req->data = write_data;

        int result = uv_write(req, (uv_stream_t*) ioTCPSoc, &write_data->uvBuff, 1, _write_tcp_cb);

        if (result < 0) {
            write_data->callback(result);

            delete req;
            delete write_data;
        } else
            connReset = false;
    }

    void IOTCP::write(void* buffer, size_t size, write_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (aloop)
            aloop->addWork([=]{
                _write(buffer, size, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTCP::_write(void* buffer, size_t size, write_cb callback) {
        auto req = new uv_write_t();
        auto write_data = new writeTCP_data();

        write_data->callback = std::move(callback);
        write_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);
        write_data->data = nullptr;
        write_data->connReset = connReset;

        req->data = write_data;

        int result = uv_write(req, (uv_stream_t*) ioTCPSoc, &write_data->uvBuff, 1, _write_tcp_cb);

        if (result < 0) {
            write_data->callback(result);

            delete write_data;
            delete req;
        } else
            connReset = false;
    }

    void IOTCP::close(close_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        stopRead();

        if (aloop)
            aloop->addWork([=]{
                _close(callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTCP::_close(close_cb callback) {
        auto socket_data = new closeSocket_data();

        socket_data->callback = std::move(callback);
        socket_data->connReset = connReset;
        socket_data->handle = this;

        auto handle = (uv_handle_t*) ioTCPSoc;

        if (handle->data && (type == TCP_SOCKET_LISTEN)) {
            delete (openTCP_data *) handle->data;
            handle->data = nullptr;
        }

        if (!handle->data) {
            auto sockData = new TCPSocket_data();
            sockData->read = sockData->close = nullptr;
            handle->data = sockData;
        }

        ((TCPSocket_data*) handle->data)->close = socket_data;

        closed = true;

        if (!uv_is_closing(handle)) {
            uv_close(handle, _close_handle_cb);
        } else {
            ((TCPSocket_data*) handle->data)->close = nullptr;

            socket_data->callback(connReset ? UV_ECONNRESET : 0);

            delete socket_data;
        }

        connReset = false;
    }

    bool IOTCP::isIPv4(const char *ip)
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

    void IOTCP::_listen_cb(uv_stream_t* stream, int result) {
        auto socket_data = (openTCP_data*) stream->data;

        socket_data->callback(result);
    }

    void IOTCP::_connect_cb(uv_connect_t* connect, int result) {
        auto socket_data = (connect_data*) connect->handle->data;

        connect->handle->data = nullptr;

        socket_data->callback(result);

        delete socket_data;
    }

    void IOTCP::_write_tcp_cb(uv_write_t* req, int status) {
        auto write_data = (writeTCP_data*) req->data;

        if (write_data->connReset)
            status = UV_ECONNRESET;

        if (write_data->data)
            write_data->data.reset();

        write_data->callback((status < 0) ? status : write_data->uvBuff.len);

        delete write_data;
        delete req;
    }

    void IOTCP::_alloc_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto read_data = (readTCP_data*) ((TCPSocket_data*) handle->data)->read;

        size_t size = suggested_size;
        if (read_data->maxBytesToRead && (size > read_data->maxBytesToRead))
            size = read_data->maxBytesToRead;

        *buf = uv_buf_init((char*) malloc(size), (unsigned int) size);
    }

    void IOTCP::_allocBuffer_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto recv_data = (readBufferTCP_data*) ((TCPSocket_data*) handle->data)->read;

        *buf = uv_buf_init((char*) recv_data->buffer, (unsigned int) recv_data->maxBytesToRead);
    }

    void IOTCP::_read_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop(stream);

        if (nread == UV_EOF)
            nread = 0;

        auto read_data = (readTCP_data*) ((TCPSocket_data*) stream->data)->read;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            read_data->handle->setConnectionReset();
        }

        IOTCP* TCPHandle = read_data->handle;
        ((TCPSocket_data*) stream->data)->read = nullptr;

        if (nread > 0) {
            ssize_t vector_size = nread;
            if (read_data->maxBytesToRead && (vector_size > read_data->maxBytesToRead))
                vector_size = read_data->maxBytesToRead;

            byte_vector data((unsigned long) vector_size);
            data.assign(buf->base, buf->base + vector_size);

            read_data->callback(data, vector_size);
        } else
            read_data->callback(byte_vector(), nread);

        delete read_data;

        free(buf->base);

        TCPHandle->checkReadQueue();
    }

    void IOTCP::_readBuffer_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop(stream);

        if (nread == UV_EOF)
            nread = 0;

        auto read_data = (readBufferTCP_data*) ((TCPSocket_data*) stream->data)->read;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            read_data->handle->setConnectionReset();
        }

        IOTCP* TCPHandle = read_data->handle;
        ((TCPSocket_data*) stream->data)->read = nullptr;

        read_data->callback(nread);

        delete read_data;

        TCPHandle->checkReadQueue();
    }

    void IOTCP::_close_handle_cb(uv_handle_t* handle) {
        auto socket_data = (closeSocket_data*) ((TCPSocket_data*) handle->data)->close;

        ((TCPSocket_data*) handle->data)->close = nullptr;

        socket_data->callback(socket_data->connReset ? UV_ECONNRESET : 0);

        if (socket_data->handle)
            ((IOTCP*) socket_data->handle)->stopOwnLoop();

        delete socket_data;
    }

    void IOTCP::open(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        auto socket_data = new openTCP_data();

        socket_data->callback = std::move(callback);

        ioTCPSoc->data = socket_data;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
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
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
            return;
        }

        result = uv_listen((uv_stream_t *) ioTCPSoc, maxConnections, _listen_cb);

        if (result < 0) {
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
        } else
            type = TCP_SOCKET_LISTEN;
    }

    void IOTCP::connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        std::string strBindIP = bindIP;
        std::string strIP = IP;
        if (aloop)
            aloop->addWork([=]{
                _connect(strBindIP, bindPort, strIP, port, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTCP::_connect(std::string bindIP, unsigned int bindPort, std::string IP, unsigned int port, connect_cb callback) {
        auto socket_data = new connect_data();

        socket_data->callback = std::move(callback);

        ioTCPSoc->data = socket_data;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            freeRequest();
            return;
        }

        sockaddr_in addr;
        sockaddr_in6 addr6;

        if (isIPv4(bindIP.data())) {
            uv_ip4_addr(bindIP.data(), bindPort, &addr);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr, 0);
        } else {
            uv_ip6_addr(bindIP.data(), bindPort, &addr6);
            result = uv_tcp_bind(ioTCPSoc, (const struct sockaddr *) &addr6, 0);
        }

        if (result < 0) {
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
            return;
        }

        if (isIPv4(IP.data())) {
            uv_ip4_addr(IP.data(), port, &addr);
            result = uv_tcp_connect(&ioConnection, ioTCPSoc, (const sockaddr*) &addr, _connect_cb);
        } else {
            uv_ip6_addr(IP.data(), port, &addr6);
            result = uv_tcp_connect(&ioConnection, ioTCPSoc, (const sockaddr*) &addr6, _connect_cb);
        }

        if (result < 0) {
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
        } else
            type = TCP_SOCKET_CONNECTED;
    }

    IOTCP* IOTCP::accept(ssize_t* result) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_LISTEN)
            throw std::logic_error("TCP socket not listen.");

        auto client = new IOTCP(aloop);

        int res = client->acceptFromListeningSocket(this);

        if (res < 0)
            delete client;

        if (result)
            *result = res;

        return (res >= 0) ? client : nullptr;
    }

    int IOTCP::acceptFromListeningSocket(IOTCP* listenSocket) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            freeRequest();

            return result;
        }

        result = uv_accept((uv_stream_t*) listenSocket->getTCPSocket(), (uv_stream_t*) ioTCPSoc);

        if (result < 0) {
            type = TCP_SOCKET_ERROR;
        } else
            type = TCP_SOCKET_CONNECTED;

        return result;
    }

    int IOTCP::enableKeepAlive(unsigned int delay) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 1, delay);
    }

    int IOTCP::disableKeepAlive() {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 0, 0);
    }

    ioTCPSocket* IOTCP::getTCPSocket() {
        return ioTCPSoc;
    }

    void IOTCP::setConnectionReset() {
        connReset = true;
    }

    void IOTCP::stopRead() {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (aloop)
            aloop->addWork([=]{
                uv_read_stop((uv_stream_t*) ioTCPSoc);

                // free read queue
                while (!readQueue.empty()) {
                    auto tcp_read_data = readQueue.get();

                    if (tcp_read_data.bufferized)
                        delete (readBufferTCP_data*) tcp_read_data.data;
                    else
                        delete (readTCP_data*) tcp_read_data.data;
                }
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTCP::freeReadData() {
        if (ioTCPSoc && ioTCPSoc->data) {
            auto sockData = (TCPSocket_data*) ioTCPSoc->data;

            if (sockData->read) {
                if (bufferized)
                    delete (readBufferTCP_data*) sockData->read;
                else
                    delete (readTCP_data *) sockData->read;

                sockData->read = nullptr;
            }
        }
    }
}