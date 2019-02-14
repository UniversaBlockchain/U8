//
// Created by Tairov Dmitriy on 10.02.19.
//

#include "IOTCP.h"

namespace asyncio {

    IOTCP::IOTCP(ioLoop* loop) {
        this->loop = loop;
        ioTCPSoc = nullptr;
    }

    IOTCP::~IOTCP() {
       if (ioTCPSoc && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING_TCP---\n");
                freeRequest();
            });

        } else
            freeRequest();
    }

    void IOTCP::freeRequest() {
        if (ioTCPSoc) {
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
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        auto read_data = new readTCP_data();

        read_data->callback = std::move(callback);
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;

        if (readQueue.empty() && !tcpReading) {
            tcpReading = true;

            ioTCPSoc->data = read_data;

            int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

            if (result < 0) {
                ioTCPSoc->data = nullptr;

                read_data->callback(byte_vector(), result);

                delete read_data;
            } else
                alarmAuxLoop(loop);
        } else
            readQueue.push({read_data, false});
    }

    void IOTCP::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if (!ioTCPSoc)
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

            ioTCPSoc->data = read_data;

            int result = uv_read_start((uv_stream_t*) ioTCPSoc, _allocBuffer_tcp_cb, _readBuffer_tcp_cb);

            if (result < 0) {
                ioTCPSoc->data = nullptr;

                read_data->callback(result);

                delete read_data;
            } else
                alarmAuxLoop(loop);
        } else
            readQueue.push({read_data, true});
    }

    void IOTCP::checkReadQueue() {
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
                ioTCPSoc->data = nullptr;

                read_data->callback(result);

                delete read_data;
            } else
                alarmAuxLoop(loop);
        } else {
            auto read_data = (readTCP_data*) tcp_read_data.data;

            ioTCPSoc->data = read_data;

            int result = uv_read_start((uv_stream_t*) ioTCPSoc, _alloc_tcp_cb, _read_tcp_cb);

            if (result < 0) {
                ioTCPSoc->data = nullptr;

                read_data->callback(byte_vector(), result);

                delete read_data;
            } else
                alarmAuxLoop(loop);
        }
    }

    void IOTCP::write(const byte_vector& data, write_cb callback) {
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

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

    void IOTCP::write(void* buffer, size_t size, write_cb callback) {
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

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

    void IOTCP::close(close_cb callback) {
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        stopRead();

        auto socket_data = new closeSocket_data();

        socket_data->callback = std::move(callback);
        socket_data->connReset = connReset;

        auto handle = (uv_handle_t*) ioTCPSoc;

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
        auto rcv_data = (readTCP_data*) handle->data;

        size_t vector_size = suggested_size;
        if (vector_size > rcv_data->maxBytesToRead)
            vector_size = rcv_data->maxBytesToRead;

        rcv_data->data = std::make_shared<byte_vector>(vector_size);
        *buf = uv_buf_init((char*) rcv_data->data->data(), (unsigned int) vector_size);
    }

    void IOTCP::_allocBuffer_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto recv_data = (readBufferTCP_data*) handle->data;

        *buf = uv_buf_init((char*) recv_data->buffer, (unsigned int) recv_data->maxBytesToRead);
    }

    void IOTCP::_read_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
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

        IOTCP* TCPHandle = read_data->handle;
        stream->data = nullptr;

        read_data->callback(*read_data->data, nread);

        read_data->data.reset();
        delete read_data;

        TCPHandle->checkReadQueue();
    }

    void IOTCP::_readBuffer_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop(stream);

        if (nread == UV_EOF)
            nread = 0;

        auto read_data = (readBufferTCP_data*) stream->data;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            read_data->handle->setConnectionReset();
        }

        IOTCP* TCPHandle = read_data->handle;
        stream->data = nullptr;

        read_data->callback(nread);

        delete read_data;

        TCPHandle->checkReadQueue();
    }

    void IOTCP::_close_handle_cb(uv_handle_t* handle) {
        auto socket_data = (closeSocket_data*) handle->data;

        socket_data->callback(socket_data->connReset ? UV_ECONNRESET : 0);

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

    void IOTCP::connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

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

    IOTCP* IOTCP::accept(ssize_t* result) {
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_LISTEN)
            throw std::logic_error("TCP socket not listen.");

        auto client = new IOTCP(loop);

        int res = client->acceptFromListeningSocket(this);

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
        } else {
            type = TCP_SOCKET_CONNECTED;
            alarmAuxLoop(loop);
        }

        return result;
    }

    int IOTCP::enableKeepAlive(unsigned int delay) {
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 1, delay);
    }

    int IOTCP::disableKeepAlive() {
        if (!ioTCPSoc)
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
        if (!ioTCPSoc)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        uv_read_stop((uv_stream_t*) ioTCPSoc);
    }
}