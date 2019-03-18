//
// Created by Tairov Dmitriy on 10.02.19.
//

#include "IOUDP.h"

namespace asyncio {

    IOUDP::IOUDP(AsyncLoop* loop) {
        if (!loop) {
            aloop = new AsyncLoop();
            ownLoop = true;
        } else {
            aloop = loop;
            ownLoop = false;
        }

        this->loop = aloop->getLoop();
        ioUDPSoc = nullptr;
    }

    IOUDP::~IOUDP() {
        if (ioUDPSoc && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING_UDP---\n");
                freeRequest();

                if (ownLoop)
                    delete aloop;
            });

        } else {
            freeRequest();

            if (ownLoop)
                delete aloop;
        }
    }

    void IOUDP::stopOwnLoop() {
        if (ownLoop)
            aloop->stop();
    }

    void IOUDP::freeRequest() {
        if (ioUDPSoc) {
            if (ioUDPSoc->data) {
                auto sockData = (UDPSocket_data *) ioUDPSoc->data;

                if (sockData->recv) {
                    if (bufferizedRecv)
                        delete (recvBuffer_data*) sockData->recv;
                    else
                        delete (recv_data*) sockData->recv;
                }

                if (sockData->read) {
                    if (bufferizedRead)
                        delete (readUDPBuffer_data*) sockData->read;
                    else
                        delete (readUDP_data *) sockData->read;
                }

                delete sockData;
            }

            delete ioUDPSoc;
            ioUDPSoc = nullptr;
        }

        recvMode = readMode = false;
    }

    bool IOUDP::initUDPSocket() {
        if (!ioUDPSoc)
            ioUDPSoc = new uv_udp_t();
        else if (closed) {
            freeRequest();
            ioUDPSoc = new uv_udp_t();
        } else
            return false;

        auto sockData = new UDPSocket_data();
        sockData->recv = sockData->read = sockData->close = nullptr;
        ioUDPSoc->data = sockData;

        return true;
    }

    void IOUDP::read(size_t maxBytesToRead, read_cb callback) {
        if (!defaultPort)
            throw std::logic_error("Default IP and port not specified. Use method setDefaultAddress.");

        if (recvMode)
            throw std::logic_error("UDP socket in receive mode. Use method stopRecv for stop receiving.");

        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        auto read_data = new readUDP_data();

        read_data->callback = std::move(callback);
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;
        read_data->IP = defaultIP;
        read_data->port = defaultPort;

        if (readQueue.empty() && !readMode) {
            readMode = true;
            bufferizedRead = false;

            freeReadData();

            ((UDPSocket_data*) ioUDPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_udp_recv_start(ioUDPSoc, _alloc_read_cb, _read_cb);

                    if (result < 0) {
                        ((UDPSocket_data*) ioUDPSoc->data)->read = nullptr;

                        read_data->callback(byte_vector(), result);

                        delete read_data;
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else
            readQueue.put({read_data, false});
    }

    void IOUDP::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if (!defaultPort)
            throw std::logic_error("Default IP and port not specified. Use method setDefaultAddress.");

        if (recvMode)
            throw std::logic_error("UDP socket in receive mode. Use method stopRecv for stop receiving.");

        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        auto read_data = new readUDPBuffer_data();

        read_data->callback = std::move(callback);
        read_data->buffer = buffer;
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;
        read_data->IP = defaultIP;
        read_data->port = defaultPort;

        if (readQueue.empty() && !readMode) {
            readMode = true;
            bufferizedRead = true;

            freeReadData();

            ((UDPSocket_data*) ioUDPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_udp_recv_start(ioUDPSoc, _alloc_readBuffer_cb, _readBuffer_cb);

                    if (result < 0) {
                        ((UDPSocket_data*) ioUDPSoc->data)->read = nullptr;

                        read_data->callback(result);

                        delete read_data;
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else
            readQueue.put({read_data, true});
    }

    void IOUDP::checkReadQueue() {
        if (readQueue.empty()) {
            readMode = false;
            return;
        }

        if (((UDPSocket_data*) ioUDPSoc->data)->read)
            throw std::logic_error("Error deleting read data.");

        auto udp_read_data = readQueue.get();

        bufferizedRead = udp_read_data.bufferized;
        if (bufferizedRead) {
            auto read_data = (readUDPBuffer_data*) udp_read_data.data;

            ((UDPSocket_data*) ioUDPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_udp_recv_start(ioUDPSoc, _alloc_readBuffer_cb, _readBuffer_cb);

                    if (result < 0) {
                        ((UDPSocket_data*) ioUDPSoc->data)->read = nullptr;

                        read_data->callback(result);

                        delete read_data;
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");


        } else {
            auto read_data = (readUDP_data*) udp_read_data.data;

            ((UDPSocket_data*) ioUDPSoc->data)->read = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_udp_recv_start(ioUDPSoc, _alloc_read_cb, _read_cb);

                    if (result < 0) {
                        ((UDPSocket_data*) ioUDPSoc->data)->read = nullptr;

                        read_data->callback(byte_vector(), result);

                        delete read_data;
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");

        }
    }

    void IOUDP::write(const byte_vector& data, write_cb callback) {
        if (!defaultPort)
            throw std::logic_error("Default IP and port not specified. Use method setDefaultAddress.");

        if (aloop)
            aloop->addWork([=]{
                _send(data, defaultIP, defaultPort, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::write(void* buffer, size_t size, write_cb callback) {
        if (!defaultPort)
            throw std::logic_error("Default IP and port not specified. Use method setDefaultAddress.");

        if (aloop)
            aloop->addWork([=]{
                _send(buffer, size, defaultIP, defaultPort, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::close(close_cb callback) {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (readMode)
            stopRead();

        if (recvMode)
            stopRecv();

        if (aloop)
            aloop->addWork([=]{
                _close(callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::_close(close_cb callback) {
        auto socket_data = new closeSocket_data();

        socket_data->callback = std::move(callback);
        socket_data->connReset = false;
        socket_data->handle = this;

        auto handle = (uv_handle_t*) ioUDPSoc;

        ((UDPSocket_data*) handle->data)->close = socket_data;

        closed = true;

        if (!uv_is_closing(handle)) {
            uv_close(handle, _close_handle_cb);
        } else {
            ((UDPSocket_data*) handle->data)->close = nullptr;

            socket_data->callback(0);

            delete socket_data;
        }
    }

    bool IOUDP::isIPv4(const char *ip)
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

    void IOUDP::_alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        *buf = uv_buf_init((char*) malloc(suggested_size), (unsigned int) suggested_size);
    }

    void IOUDP::_allocBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto recv_data = (recvBuffer_data*) ((UDPSocket_data*) handle->data)->recv;

        *buf = uv_buf_init((char*) recv_data->buffer, (unsigned int) recv_data->maxBytesToRecv);
    }

    void IOUDP::_recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto rcv_data = (recv_data*) ((UDPSocket_data*) handle->data)->recv;

        if (!nread) {
            free(buf->base);
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

        if (nread < 0) {
            free(buf->base);
            rcv_data->callback(nread, byte_vector(), nullptr, 0);
            return;
        }

        byte_vector data((unsigned long) nread);
        data.assign(buf->base, buf->base + nread);

        rcv_data->callback(nread, data, ip, port);

        free(buf->base);
    }

    void IOUDP::_recvBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto recv_data = (recvBuffer_data*) ((UDPSocket_data*) handle->data)->recv;

        if (!nread)
            return;

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

    void IOUDP::_alloc_read_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto read_data = (readUDP_data*) ((UDPSocket_data*) handle->data)->read;

        size_t size = suggested_size;
        if (size > read_data->maxBytesToRead)
            size = read_data->maxBytesToRead;

        *buf = uv_buf_init((char*) malloc(size), (unsigned int) size);
    }

    void IOUDP::_alloc_readBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf) {
        auto read_data = (readUDPBuffer_data*) ((UDPSocket_data*) handle->data)->read;

        *buf = uv_buf_init((char*) read_data->buffer, (unsigned int) read_data->maxBytesToRead);
    }

    void IOUDP::_read_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto read_data = (readUDP_data*) ((UDPSocket_data*) handle->data)->read;

        if (!nread) {
            free(buf->base);
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

        // compare with default IP and port
        if ((read_data->IP == ip) && (read_data->port == port)) {
            uv_udp_recv_stop(handle);

            IOUDP* UDPHandle = read_data->handle;
            ((UDPSocket_data*) handle->data)->read = nullptr;

            if (nread > 0) {
                ssize_t vector_size = nread;
                if (vector_size > read_data->maxBytesToRead)
                    vector_size = read_data->maxBytesToRead;

                byte_vector data((unsigned long) vector_size);
                data.assign(buf->base, buf->base + vector_size);

                read_data->callback(data, vector_size);
            } else
                read_data->callback(byte_vector(), nread);

            delete read_data;

            UDPHandle->checkReadQueue();
        }

        free(buf->base);
    }

    void IOUDP::_readBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags) {
        auto read_data = (readUDPBuffer_data*) ((UDPSocket_data*) handle->data)->read;

        if (!nread)
            return;

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

        // compare with default IP and port
        if ((read_data->IP == ip) && (read_data->port == port)) {
            uv_udp_recv_stop(handle);

            IOUDP* UDPHandle = read_data->handle;
            ((UDPSocket_data*) handle->data)->read = nullptr;

            read_data->callback(nread);

            delete read_data;

            UDPHandle->checkReadQueue();
        }
    }

    void IOUDP::_send_cb(uv_udp_send_t* req, int status) {
        auto snd_data = (send_data*) req->data;

        if (snd_data->data)
            snd_data->data.reset();

        snd_data->callback((status < 0) ? status : snd_data->uvBuff.len);

        delete snd_data;
        delete req;
    }

    void IOUDP::_close_handle_cb(uv_handle_t* handle) {
        auto socket_data = (closeSocket_data*) ((UDPSocket_data*) handle->data)->close;

        ((UDPSocket_data*) handle->data)->close = nullptr;

        socket_data->callback(socket_data->connReset ? UV_ECONNRESET : 0);

        if (socket_data->handle)
            ((IOUDP*) socket_data->handle)->stopOwnLoop();

        delete socket_data;
    }

    int IOUDP::open(const char* IP, unsigned int port, unsigned int bufferSize) {
        if (!initUDPSocket())
            throw std::logic_error("UDP socket already initialized. Close socket first.");

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

        if (bufferSize > 0) {
            int snd_val = bufferSize;
            int rcv_val = bufferSize;
            uv_send_buffer_size((uv_handle_t*) ioUDPSoc, &snd_val);
            uv_recv_buffer_size((uv_handle_t*) ioUDPSoc, &rcv_val);
        }

        /*snd_val = 0;
        rcv_val = 0;
        uv_send_buffer_size((uv_handle_t*) ioUDPSoc, &snd_val);
        uv_recv_buffer_size((uv_handle_t*) ioUDPSoc, &rcv_val);*/

        if (result < 0)
            type = UDP_SOCKET_ERROR;
        else
            type = UDP_SOCKET;

        return result;
    }

    void IOUDP::recv(recv_cb callback) {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        if (readMode)
            throw std::logic_error("UDP socket in read mode. Wait read datagram or use method stopRead for stop reading.");

        if (recvMode)
            throw std::logic_error("UDP socket already in receive mode. Before use method stopRecv for stop receiving.");

        if (aloop)
            aloop->addWork([=]{
                _recv(callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::_recv(recv_cb callback) {
        freeRecvData();

        auto rcv_data = new recv_data();

        rcv_data->callback = std::move(callback);

        ((UDPSocket_data*) ioUDPSoc->data)->recv = rcv_data;

        bufferizedRecv = false;

        int result = uv_udp_recv_start(ioUDPSoc, _alloc_cb, _recv_cb);

        if (result < 0) {
            ((UDPSocket_data*) ioUDPSoc->data)->recv = nullptr;

            rcv_data->callback(result, byte_vector(), nullptr, 0);

            delete rcv_data;
        }
    }

    void IOUDP::recv(void* buffer, size_t maxBytesToRecv, recvBuffer_cb callback) {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        if (readMode)
            throw std::logic_error("UDP socket in read mode. Wait read datagram or use method stopRead for stop reading.");

        if (recvMode)
            throw std::logic_error("UDP socket already in receive mode. Before use method stopRecv for stop receiving.");

        if (aloop)
            aloop->addWork([=]{
                _recv(buffer, maxBytesToRecv, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::_recv(void* buffer, size_t maxBytesToRecv, recvBuffer_cb callback) {
        freeRecvData();

        auto recv_data = new recvBuffer_data();

        recv_data->callback = std::move(callback);
        recv_data->buffer = buffer;
        recv_data->maxBytesToRecv = maxBytesToRecv;

        ((UDPSocket_data*) ioUDPSoc->data)->recv = recv_data;

        bufferizedRecv = true;

        int result = uv_udp_recv_start(ioUDPSoc, _allocBuffer_cb, _recvBuffer_cb);

        if (result < 0) {
            ((UDPSocket_data*) ioUDPSoc->data)->recv = nullptr;

            recv_data->callback(result, nullptr, 0);

            delete recv_data;
        }
    }

    void IOUDP::send(const byte_vector& data, const char* IP, unsigned int port, send_cb callback) {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        std::string ip = IP;
        if (aloop)
            aloop->addWork([=]{
                _send(data, ip, port, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::_send(const byte_vector& data, std::string IP, unsigned int port, send_cb callback) {
        auto req = new uv_udp_send_t();
        auto snd_data = new send_data();

        snd_data->callback = std::move(callback);
        snd_data->req = req;
        snd_data->data = std::make_shared<byte_vector>(data);
        snd_data->uvBuff = uv_buf_init((char*) snd_data->data->data(), (unsigned int) snd_data->data->size());

        req->data = snd_data;

        int result;
        if (isIPv4(IP.data())) {
            sockaddr_in addr;
            uv_ip4_addr(IP.data(), port, &addr);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr, _send_cb);
        } else {
            sockaddr_in6 addr6;
            uv_ip6_addr(IP.data(), port, &addr6);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr6, _send_cb);
        }

        if (result < 0) {
            snd_data->callback(result);

            delete snd_data;
            delete req;
        }
    }

    void IOUDP::send(void* buffer, size_t size, const char* IP, unsigned int port, send_cb callback) {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (type == UDP_SOCKET_ERROR)
            throw std::logic_error("UDP socket initialized with error. Close and open socket.");

        std::string ip = IP;
        if (aloop)
            aloop->addWork([=]{
                _send(buffer, size, ip, port, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::_send(void* buffer, size_t size, std::string IP, unsigned int port, send_cb callback) {
        auto req = new uv_udp_send_t();
        auto snd_data = new send_data();

        snd_data->callback = std::move(callback);
        snd_data->req = req;
        snd_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);
        snd_data->data = nullptr;

        req->data = snd_data;

        int result;
        if (isIPv4(IP.data())) {
            sockaddr_in addr;
            uv_ip4_addr(IP.data(), port, &addr);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr, _send_cb);
        } else {
            sockaddr_in6 addr6;
            uv_ip6_addr(IP.data(), port, &addr6);
            result = uv_udp_send(req, ioUDPSoc, &snd_data->uvBuff, 1, (const struct sockaddr*) &addr6, _send_cb);
        }

        if (result < 0) {
            snd_data->callback(result);

            delete snd_data;
            delete req;
        }
    }

    void IOUDP::stopRecv() {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (readMode)
            throw std::logic_error("UDP socket in read mode. Wait read datagram or use method stopRead for stop reading.");

        if (aloop)
            aloop->addWork([=]{
                uv_udp_recv_stop(ioUDPSoc);

                recvMode = false;
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::stopRead() {
        if (!ioUDPSoc || closed)
            throw std::logic_error("UDP socket not initialized. Open socket first.");

        if (recvMode)
            throw std::logic_error("UDP socket in receive mode. Use method stopRecv for stop receiving.");

        if (aloop)
            aloop->addWork([=]{
                uv_udp_recv_stop(ioUDPSoc);

                // free read queue
                while (!readQueue.empty()) {
                    auto udp_read_data = readQueue.get();

                    if (udp_read_data.bufferized)
                        delete (readUDPBuffer_data*) udp_read_data.data;
                    else
                        delete (readUDP_data*) udp_read_data.data;
                }

                readMode = false;
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOUDP::freeRecvData() {
        if (ioUDPSoc && ioUDPSoc->data) {
            auto sockData = (UDPSocket_data *) ioUDPSoc->data;

            if (sockData->recv) {
                if (bufferizedRecv)
                    delete (recvBuffer_data*) sockData->recv;
                else
                    delete (recv_data*) sockData->recv;

                sockData->recv = nullptr;
            }
        }
    }

    void IOUDP::freeReadData() {
        if (ioUDPSoc && ioUDPSoc->data) {
            auto sockData = (UDPSocket_data *) ioUDPSoc->data;

            if (sockData->read) {
                if (bufferizedRead)
                    delete (readUDPBuffer_data*) sockData->read;
                else
                    delete (readUDP_data *) sockData->read;

                sockData->read = nullptr;
            }
        }
    }

    void IOUDP::setDefaultAddress(const char* IP, unsigned int port) {
        defaultIP = IP;
        defaultPort = port;
    }
}