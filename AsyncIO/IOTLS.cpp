//
// Created by Tairov Dmitriy on 01.03.19.
//

#include "IOTLS.h"
#include <cstring>

namespace asyncio {

    IOTLS::IOTLS(AsyncLoop* loop) {
        if (!loop) {
            aloop = new AsyncLoop();
            ownLoop = true;
        } else {
            aloop = loop;
            ownLoop = false;
        }

        this->loop = aloop->getLoop();
        ioTCPSoc = nullptr;

        tls_data.TLScontext = nullptr;
        tls_data.tls = nullptr;
    }

    IOTLS::~IOTLS() {
        if (ioTCPSoc && !closed) {
            close([&](ssize_t result) {
                //printf("---AUTO_CLOSING_TCP---\n");
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

    void IOTLS::stopOwnLoop() {
        if (ownLoop)
            aloop->stop();
    }

    void IOTLS::freeRequest() {
        if (ioTCPSoc) {
            delete ioTCPSoc;
            ioTCPSoc = nullptr;
        }

        if (tls_data.TLScontext) {
            if (!accepted)
                delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
        }

        if (tls_data.tls) {
            delete tls_data.tls;
            tls_data.tls = nullptr;
        }
    }

    bool IOTLS::initTCPSocket() {
        if (!ioTCPSoc)
            ioTCPSoc = new uv_tcp_t();
        else if (closed) {
            freeRequest();
            ioTCPSoc = new uv_tcp_t();
        } else
            return false;

        return true;
    }

    void IOTLS::read(size_t maxBytesToRead, read_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (!tls_data.tls)
            throw std::logic_error("TLS not initialized.");

        auto read_data = new readTLS_data();

        read_data->callback = std::move(callback);
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;

        if (readQueue.empty() && !tlsReading) {
            tlsReading = true;

            if (!dataQueue.empty()) {
                byte_vector data;

                while (!dataQueue.empty() && data.size() < maxBytesToRead)
                    data.push_back((uint8_t) dataQueue.get());

                read_data->callback(data, data.size());

                delete read_data;
                checkReadQueue();
                return;
            }

            bufferized = false;

            freeReadData();

            tls_data.tls->read_data = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_tls_read(tls_data.tls, _read_tls_cb);

                    if (result < 0) {
                        tls_data.tls->read_data = nullptr;

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

    void IOTLS::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (!tls_data.tls)
            throw std::logic_error("TLS not initialized.");

        auto read_data = new readBufferTLS_data();

        read_data->callback = std::move(callback);
        read_data->buffer = buffer;
        read_data->maxBytesToRead = maxBytesToRead;
        read_data->handle = this;

        if (readQueue.empty() && !tlsReading) {
            tlsReading = true;

            if (!dataQueue.empty()) {
                int len = 0;

                while (!dataQueue.empty() && len < maxBytesToRead) {
                    ((char*) read_data->buffer)[len] = dataQueue.get();
                    len++;
                }

                read_data->callback(len);

                delete read_data;
                checkReadQueue();
                return;
            }

            bufferized = true;

            freeReadData();

            tls_data.tls->read_data = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_tls_read(tls_data.tls, _readBuffer_tls_cb);

                    if (result < 0) {
                        tls_data.tls->read_data = nullptr;

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

    void IOTLS::checkReadQueue() {
        if (readQueue.empty()) {
            tlsReading = false;
            return;
        }

        if (tls_data.tls->read_data)
            throw std::logic_error("Error deleting read data.");

        auto tls_read_data = readQueue.get();

        bufferized = tls_read_data.bufferized;
        if (bufferized) {
            auto read_data = (readBufferTLS_data*) tls_read_data.data;

            if (!dataQueue.empty()) {
                int len = 0;

                while (!dataQueue.empty() && len < read_data->maxBytesToRead) {
                    ((char*) read_data->buffer)[len] = dataQueue.get();
                    len++;
                }

                read_data->callback(len);

                delete read_data;
                checkReadQueue();
                return;
            }

            tls_data.tls->read_data = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_tls_read(tls_data.tls, _readBuffer_tls_cb);

                    if (result < 0) {
                        tls_data.tls->read_data = nullptr;

                        read_data->callback(result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        } else {
            auto read_data = (readTLS_data*) tls_read_data.data;

            if (!dataQueue.empty()) {
                byte_vector data;

                while (!dataQueue.empty() && data.size() < read_data->maxBytesToRead)
                    data.push_back((uint8_t) dataQueue.get());

                read_data->callback(data, data.size());

                delete read_data;
                checkReadQueue();
                return;
            }

            tls_data.tls->read_data = read_data;

            if (aloop)
                aloop->addWork([=]{
                    int result = uv_tls_read(tls_data.tls, _read_tls_cb);

                    if (result < 0) {
                        tls_data.tls->read_data = nullptr;

                        read_data->callback(byte_vector(), result);

                        delete read_data;
                        checkReadQueue();
                    }
                });
            else
                throw std::logic_error("Async loop not initialized.");
        }
    }

    void IOTLS::write(const byte_vector& data, write_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (!tls_data.tls)
            throw std::logic_error("TLS not initialized.");

        if (aloop)
            aloop->addWork([=]{
                _write(data, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTLS::_write(const byte_vector& data, write_cb callback) {
        auto write_data = new writeTCP_data();

        write_data->callback = std::move(callback);
        write_data->data = std::make_shared<byte_vector>(data);
        write_data->uvBuff = uv_buf_init((char*) write_data->data->data(), (unsigned int) write_data->data->size());
        write_data->connReset = connReset;

        tls_data.tls->write_data = write_data;

        int result = uv_tls_write(tls_data.tls,  &write_data->uvBuff, _write_tls_cb);

        if (result < 0) {
            write_data->callback(result);

            delete write_data;
        } else
            connReset = false;
    }

    void IOTLS::write(void* buffer, size_t size, write_cb callback) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        if (!tls_data.tls)
            throw std::logic_error("TLS not initialized.");

        if (aloop)
            aloop->addWork([=]{
                _write(buffer, size, callback);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTLS::_write(void* buffer, size_t size, write_cb callback) {
        auto write_data = new writeTCP_data();

        write_data->callback = std::move(callback);
        write_data->uvBuff = uv_buf_init((char*) buffer, (unsigned int) size);
        write_data->data = nullptr;
        write_data->connReset = connReset;

        tls_data.tls->write_data = write_data;

        int result = uv_tls_write(tls_data.tls,  &write_data->uvBuff, _write_tls_cb);

        if (result < 0) {
            write_data->callback(result);

            delete write_data;
        } else
            connReset = false;
    }

    void IOTLS::close(close_cb callback) {
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

    void IOTLS::_close(close_cb callback) {
        auto handle = (uv_handle_t*) ioTCPSoc;

        if (handle->data && (type == TCP_SOCKET_LISTEN))
            delete (openTCP_data*) handle->data;

        if ((type == TCP_SOCKET_CONNECTED) && tls_data.tls) {
            if (!tls_data.tls->close_data) {
                if (accepted)
                    tls_data.TLScontext = nullptr;

                if (((connect_accept_TLS_data*) ioTCPSoc->data)->handshake) {
                    auto socket_data = new closeTLS_data();

                    socket_data->callback = std::move(callback);
                    socket_data->tls_data = &tls_data;
                    socket_data->connReset = connReset;
                    socket_data->handle = this;

                    tls_data.tls->close_data = socket_data;

                    uv_tls_close(tls_data.tls, [](uv_tls_t* tls){
                        auto close_data = (closeTLS_data*) tls->close_data;

                        if (tls->tcp_hdl->data) {
                            delete (connect_accept_TLS_data*) tls->tcp_hdl->data;
                            tls->tcp_hdl->data = nullptr;
                        }

                        if (close_data->tls_data->tls) {
                            delete close_data->tls_data->tls;
                            close_data->tls_data->tls = nullptr;
                        }

                        if (close_data->tls_data->TLScontext) {
                            evt_ctx_free(close_data->tls_data->TLScontext);

                            delete close_data->tls_data->TLScontext;
                            close_data->tls_data->TLScontext = nullptr;
                        }

                        close_data->callback(close_data->connReset ? UV_ECONNRESET : 0);

                        if (close_data->handle)
                            close_data->handle->stopOwnLoop();

                        delete close_data;
                    });
                } else {
                    auto sock_data = (connect_accept_TLS_data*) handle->data;
                    sock_data->close_callback = std::move(callback);
                    sock_data->connReset = connReset;
                    sock_data->handle = this;

                    uv_close((uv_handle_t*) ioTCPSoc, [](uv_handle_t* handle){
                        auto socket_data = (connect_accept_TLS_data*) handle->data;

                        handle->data = nullptr;

                        if (socket_data->tls_data->tls) {
                            delete socket_data->tls_data->tls;
                            socket_data->tls_data->tls = nullptr;
                        }

                        if (socket_data->tls_data->TLScontext) {
                            evt_ctx_free(socket_data->tls_data->TLScontext);

                            delete socket_data->tls_data->TLScontext;
                            socket_data->tls_data->TLScontext = nullptr;
                        }

                        socket_data->close_callback(socket_data->connReset ? UV_ECONNRESET : 0);

                        if (socket_data->handle)
                            socket_data->handle->stopOwnLoop();

                        delete socket_data;
                    });
                }
            }
        } else {
            freeReadData();

            if ((type == TCP_SOCKET_LISTEN) && tls_data.TLScontext) {
                evt_ctx_free(tls_data.TLScontext);

                delete tls_data.TLScontext;
                tls_data.TLScontext = nullptr;
            }

            auto socket_data = new closeSocket_data();

            socket_data->callback = std::move(callback);
            socket_data->connReset = connReset;
            socket_data->handle = this;

            handle->data = socket_data;

            uv_close(handle, _close_handle_cb);
        }

        closed = true;
        connReset = false;
    }

    bool IOTLS::isIPv4(const char *ip)
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

    void IOTLS::_listen_cb(uv_stream_t* stream, int result) {
        auto socket_data = (openTCP_data*) stream->data;

        socket_data->callback(result);
    }

    void IOTLS::_connect_cb(uv_connect_t* connect, int result) {
        auto socket_data = (connect_accept_TLS_data*) connect->handle->data;

        if (result < 0) {
            if (socket_data->tls_data->TLScontext) {
                delete socket_data->tls_data->TLScontext;
                socket_data->tls_data->TLScontext = nullptr;
            }

            connect->handle->data = nullptr;

            socket_data->connect_callback(result);

            delete socket_data;

        } else {
            auto sclient = new uv_tls_t();
            int res = uv_tls_init(socket_data->tls_data->TLScontext, (uv_tcp_t*) connect->handle, sclient);
            if (res < 0) {
                delete sclient;

                if (socket_data->tls_data->TLScontext) {
                    delete socket_data->tls_data->TLScontext;
                    socket_data->tls_data->TLScontext = nullptr;
                }

                connect->handle->data = nullptr;

                socket_data->connect_callback(res);

                delete socket_data;
            } else {
                socket_data->tls_data->tls = sclient;

                if (socket_data->timeout) {
                    socket_data->timer = new uv_timer_t();
                    uv_timer_init(connect->handle->loop, socket_data->timer);

                    socket_data->timer->data = socket_data;

                    uv_timer_start(socket_data->timer, [](uv_timer_t* handle){
                        auto socket_data = (connect_accept_TLS_data*) handle->data;

                        if (socket_data) {
                            uv_timer_stop(handle);

                            uv_close((uv_handle_t*) socket_data->timer, [](uv_handle_t* handle){
                                delete handle;
                            });

                            connect_cb cb = std::move(socket_data->connect_callback);
                            socket_data->handle->close([cb](ssize_t result){
                                cb(ERR_TLS_CONNECT_TIMEOUT);
                            });
                        }
                    }, socket_data->timeout, 0);
                }

                uv_tls_connect(sclient, _connect_cb_tls_handshake);
            }
        }
    }

    void IOTLS::_connect_cb_tls_handshake(uv_tls_t *tls, int status) {
        auto socket_data = (connect_accept_TLS_data*) tls->tcp_hdl->data;

        if (socket_data && (!socket_data->timeout || uv_is_active((const uv_handle_t*) socket_data->timer))) {
            if (socket_data->timeout) {
                uv_timer_stop(socket_data->timer);

                uv_close((uv_handle_t*) socket_data->timer, [](uv_handle_t* handle){
                    delete handle;
                });
            }

            socket_data->handshake = true;

            socket_data->connect_callback(status);
        }
    }

    void IOTLS::_write_tls_cb(uv_tls_t* tls, int status) {
        auto write_data = (writeTCP_data*) tls->write_data;

        if (write_data->connReset)
            status = UV_ECONNRESET;

        if (write_data->data)
            write_data->data.reset();

        tls->write_data = nullptr;

        write_data->callback((status < 0) ? status : write_data->uvBuff.len);

        delete write_data;
    }

    void IOTLS::_read_tls_cb(uv_tls_t* tls, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop((uv_stream_t*) tls->tcp_hdl);

        if (nread == UV_EOF)
            nread = 0;

        auto rcv_data = (readTLS_data*) tls->read_data;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            rcv_data->handle->setConnectionReset();
        }

        auto TLSHandle = rcv_data->handle;
        tls->read_data = nullptr;

        if (nread > 0) {
            ssize_t vector_size = nread;
            if (rcv_data->maxBytesToRead && (vector_size > rcv_data->maxBytesToRead)) {
                vector_size = rcv_data->maxBytesToRead;

                TLSHandle->addDataToQueue(buf->base + vector_size, (size_t)nread - vector_size);
            }

            byte_vector data((unsigned long) vector_size);
            data.assign(buf->base, buf->base + vector_size);

            rcv_data->callback(data, vector_size);
        } else
            rcv_data->callback(byte_vector(), nread);

        delete rcv_data;

        TLSHandle->checkReadQueue();
    }

    void IOTLS::_readBuffer_tls_cb(uv_tls_t* tls, ssize_t nread, const uv_buf_t* buf) {
        uv_read_stop((uv_stream_t*) tls->tcp_hdl);

        if (nread == UV_EOF)
            nread = 0;

        auto rcv_data = (readBufferTLS_data*) tls->read_data;

        if (nread == UV_ECONNRESET) {
            nread = 0;
            rcv_data->handle->setConnectionReset();
        }

        auto TLSHandle = rcv_data->handle;
        tls->read_data = nullptr;

        if (nread > 0) {
            ssize_t vector_size = nread;
            if (rcv_data->maxBytesToRead && (vector_size > rcv_data->maxBytesToRead)) {
                vector_size = rcv_data->maxBytesToRead;

                TLSHandle->addDataToQueue(buf->base + vector_size, (size_t)nread - vector_size);
            }

            memcpy(rcv_data->buffer, buf->base, (size_t) vector_size);

            rcv_data->callback(vector_size);
        } else
            rcv_data->callback(nread);

        delete rcv_data;

        TLSHandle->checkReadQueue();
    }

    void IOTLS::_close_handle_cb(uv_handle_t* handle) {
        auto socket_data = (closeSocket_data*) handle->data;

        handle->data = nullptr;

        socket_data->callback(socket_data->connReset ? UV_ECONNRESET : 0);

        if (socket_data->handle)
            ((IOTLS*) socket_data->handle)->stopOwnLoop();

        delete socket_data;
    }

    void IOTLS::_accept_cb_tls_handshake(uv_tls_t *tls, int status) {
        auto accept_data = (connect_accept_TLS_data*) tls->tcp_hdl->data;

        if (accept_data && (!accept_data->timeout || uv_is_active((const uv_handle_t*) accept_data->timer))) {
            if (accept_data->timeout) {
                uv_timer_stop(accept_data->timer);

                uv_close((uv_handle_t*) accept_data->timer, [](uv_handle_t* handle){
                    delete handle;
                });
            }

            accept_data->handshake = true;

            accept_data->accept_callback(accept_data->handle, status);
        }
    }

    void IOTLS::open(const char* IP, unsigned int port, const char* certFilePath, const char* keyFilePath,
            openTCP_cb callback, int maxConnections) {

        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        auto socket_data = new openTCP_data();

        socket_data->callback = std::move(callback);

        tls_data.TLScontext = new ioTLSContext();

        if (!evt_ctx_init_ex(tls_data.TLScontext, certFilePath, keyFilePath)) {
            delete tls_data.TLScontext;
            tls_data.TLScontext = nullptr;

            socket_data->callback(ERR_TLS_INIT_CONTEXT);

            delete socket_data;
            freeRequest();
            return;
        }

        evt_ctx_set_nio(tls_data.TLScontext, nullptr, uv_tls_writer);

        ioTCPSoc->data = socket_data;
        accepted = false;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
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
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
            return;
        }

        result = uv_listen((uv_stream_t *) ioTCPSoc, maxConnections, _listen_cb);

        if (result < 0) {
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
            ioTCPSoc->data = nullptr;

            socket_data->callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
        } else
            type = TCP_SOCKET_LISTEN;
    }

    void IOTLS::connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port,
                        const char* certFilePath, const char* keyFilePath, connect_cb callback, unsigned int timeout) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        std::string strBindIP = bindIP;
        std::string strIP = IP;
        std::string strCertFilePath = certFilePath;
        std::string strKeyFilePath = keyFilePath;
        if (aloop)
            aloop->addWork([=]{
                _connect(strBindIP, bindPort, strIP, port, strCertFilePath, strKeyFilePath, callback, timeout);
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTLS::_connect(std::string bindIP, unsigned int bindPort, std::string IP, unsigned int port,
                         std::string certFilePath, std::string keyFilePath, connect_cb callback, unsigned int timeout) {

        auto socket_data = new connect_accept_TLS_data();

        socket_data->connect_callback = std::move(callback);
        socket_data->accept_callback = nullptr;
        socket_data->handle = this;
        socket_data->timeout = timeout;
        socket_data->handshake = false;

        tls_data.TLScontext = new ioTLSContext();

        if (!evt_ctx_init_ex(tls_data.TLScontext, certFilePath.data(), keyFilePath.data())) {
            delete tls_data.TLScontext;
            tls_data.TLScontext = nullptr;

            socket_data->connect_callback(ERR_TLS_INIT_CONTEXT);

            delete socket_data;
            freeRequest();
            return;
        }

        evt_ctx_set_nio(tls_data.TLScontext, nullptr, uv_tls_writer);

        socket_data->tls_data = &tls_data;

        ioTCPSoc->data = socket_data;
        accepted = false;

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
            ioTCPSoc->data = nullptr;

            socket_data->connect_callback(result);

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
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
            ioTCPSoc->data = nullptr;

            socket_data->connect_callback(result);

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
            delete tls_data.TLScontext;

            tls_data.TLScontext = nullptr;
            ioTCPSoc->data = nullptr;

            socket_data->connect_callback(result);

            delete socket_data;
            type = TCP_SOCKET_ERROR;
        } else
            type = TCP_SOCKET_CONNECTED;
    }

    IOTLS* IOTLS::accept(accept_cb callback, unsigned int timeout) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_LISTEN)
            throw std::logic_error("TCP socket not listen.");

        auto client = new IOTLS(aloop);

        int res = client->acceptFromListeningSocket(this, std::move(callback), timeout);

        if (res < 0)
            delete client;

        return (res >= 0) ? client : nullptr;
    }

    int IOTLS::acceptFromListeningSocket(IOTLS* listenSocket, accept_cb callback, unsigned int timeout) {
        if (!initTCPSocket())
            throw std::logic_error("TCP socket already initialized. Close socket first.");

        int result = uv_tcp_init(loop, ioTCPSoc);
        if (result < 0) {
            callback(nullptr, result);

            freeRequest();
            return result;
        }

        result = uv_accept((uv_stream_t*) listenSocket->getTCPSocket(), (uv_stream_t*) ioTCPSoc);
        if (result < 0) {
            callback(nullptr, result);

            freeRequest();
            return result;
        }

        auto sclient = new uv_tls_t();
        result = uv_tls_init(listenSocket->getTLSContext(), ioTCPSoc, sclient);
        if (result < 0) {
            delete sclient;

            callback(nullptr, result);

            freeRequest();
            return result;
        }

        tls_data.TLScontext = listenSocket->getTLSContext();
        tls_data.tls = sclient;
        accepted = true;

        auto accept_data = new connect_accept_TLS_data();

        accept_data->accept_callback = std::move(callback);
        accept_data->connect_callback = nullptr;
        accept_data->handle = this;
        accept_data->tls_data = &tls_data;
        accept_data->handshake = false;
        accept_data->timeout = timeout;

        ioTCPSoc->data = accept_data;

        if (aloop)
            aloop->addWork([=]{
                if (timeout) {
                    accept_data->timer = new uv_timer_t();
                    uv_timer_init(ioTCPSoc->loop, accept_data->timer);

                    accept_data->timer->data = accept_data;

                    uv_timer_start(accept_data->timer, [](uv_timer_t* handle){
                        auto acc_data = (connect_accept_TLS_data*) handle->data;

                        if (acc_data) {
                            uv_timer_stop(handle);

                            uv_close((uv_handle_t*) acc_data->timer, [](uv_handle_t* handle){
                                delete handle;
                            });

                            accept_cb cb = std::move(acc_data->accept_callback);
                            acc_data->handle->close([cb](ssize_t result){
                                cb(nullptr, ERR_TLS_ACCEPT_TIMEOUT);
                            });
                        }
                    }, timeout, 0);
                }

                type = TCP_SOCKET_CONNECTED;

                uv_tls_accept(sclient, _accept_cb_tls_handshake);
            });
        else
            throw std::logic_error("Async loop not initialized.");

        return result;
    }

    int IOTLS::enableKeepAlive(unsigned int delay) {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 1, delay);
    }

    int IOTLS::disableKeepAlive() {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (type != TCP_SOCKET_CONNECTED)
            throw std::logic_error("TCP socket not connected.");

        return uv_tcp_keepalive(ioTCPSoc, 0, 0);
    }

    void IOTLS::stopRead() {
        if (!ioTCPSoc || closed)
            throw std::logic_error("TCP socket not initialized. Open socket first.");

        if (aloop)
            aloop->addWork([=]{
                uv_read_stop((uv_stream_t*) ioTCPSoc);

                // free read queue
                while (!readQueue.empty()) {
                    auto tcp_read_data = readQueue.get();

                    if (tcp_read_data.bufferized)
                        delete (readBufferTLS_data*) tcp_read_data.data;
                    else
                        delete (readTLS_data*) tcp_read_data.data;
                }
            });
        else
            throw std::logic_error("Async loop not initialized.");
    }

    void IOTLS::freeReadData() {
        if (ioTCPSoc && tls_data.tls) {
            auto readData = tls_data.tls->read_data;

            if (readData) {
                if (bufferized)
                    delete (readBufferTLS_data*) readData;
                else
                    delete (readTLS_data *) readData;

                tls_data.tls->read_data = nullptr;
            }
        }
    }

    ioTCPSocket* IOTLS::getTCPSocket() {
        return ioTCPSoc;
    }

    ioTLSContext* IOTLS::getTLSContext() {
        return tls_data.TLScontext;
    }

    void IOTLS::setConnectionReset() {
        connReset = true;
    }

    void IOTLS::addDataToQueue(char* buff, size_t len) {
        for (size_t i = 0; i < len; i++)
            dataQueue.put(buff[i]);
    }
}