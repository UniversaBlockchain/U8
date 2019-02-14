//
// Created by Tairov Dmitriy on 10.02.19.
//

#ifndef U8_IOTCP_H
#define U8_IOTCP_H

#include "AsyncIO.h"
#include "IOHandle.h"
#include "IOHandleThen.h"
#include "IOUDP.h"

namespace asyncio {

    /**
     * Listen TCP socket callback. Call from IOTCP::open after init, bind and listen TCP socket.
     * Callback called when a new incoming connection is received or error.
     *
     * @param result is listen TCP socket result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - TCP socket ready to accept new connections.
     */
    typedef std::function<void(ssize_t result)> openTCP_cb;

    /**
     * TCP socket connect callback. Call from IOTCP::connect after init, bind and establish an IPv4 or IPv6 TCP connection.
     * Callback called when the connection has been established or when a connection error.
     *
     * @param result is connect TCP socket result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - TCP socket successfully connected.
     */
    typedef std::function<void(ssize_t result)> connect_cb;

    class IOTCP;

    struct openTCP_data {
        openTCP_cb callback;
    };

    struct connect_data {
        connect_cb callback;
    };

    struct readTCP_data {
        read_cb callback;
        std::shared_ptr<byte_vector> data;
        size_t maxBytesToRead;
        IOTCP* handle;
    };

    struct readBufferTCP_data {
        readBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRead;
        IOTCP* handle;
    };

    struct writeTCP_data {
        write_cb callback;
        uv_write_t* req;
        uv_buf_t uvBuff;
        std::shared_ptr<byte_vector> data;
        bool connReset;
    };

    /**
     * Asynchronous TCP socket.
     */
    class IOTCP : public IOHandleThen {
    public:
        IOTCP(ioLoop* loop = asyncLoop);
        ~IOTCP();

        /**
         * Asynchronous read from TCP socket.
         *
         * @param maxBytesToRead is maximum number of bytes to read from TCP socket.
         * @param callback caused when reading from TCP socket or error.
         */
        void read(size_t maxBytesToRead, read_cb callback);

        /**
         * Asynchronous read from TCP socket to initialized buffer.
         *
         * @param buffer is initialized buffer for read from TCP socket, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from TCP socket.
         * @param callback caused when reading from TCP socket or error.
         */
        void read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback);

        /**
         * Asynchronous write to TCP socket.
         *
         * @param data is byte vector for data written to TCP socket.
         * @param callback caused when writing to TCP socket or error.
         */
        void write(const byte_vector& data, write_cb callback);

        /**
         * Asynchronous write to TCP socket from buffer.
         *
         * @param buffer contains data written to TCP socket.
         * @param size of buffer in bytes.
         * @param callback caused when writing to TCP socket or error.
         */
        void write(void* buffer, size_t size, write_cb callback);

        /**
         * Asynchronous close TCP socket.
         *
         * @param callback caused when closing a TCP socket or error.
         */
        void close(close_cb callback);

        /**
         * Asynchronous init, bind and start listening socket for incoming connections.
         *
         * @param IP address (IPv4 or IPv6).
         * @param port for binding socket.
         * @param callback is called when a new incoming connection is received or error.
         * @param maxConnections indicates the number of connections the kernel might queue.
         */
        void open(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections = SOMAXCONN);

        /**
         * Asynchronous init, bind and establish an IPv4 or IPv6 TCP connection.
         *
         * @param IP address for bind socket (IPv4 or IPv6).
         * @param port for bind socket.
         * @param IP address of remote socket (IPv4 or IPv6).
         * @param port of remote socket.
         * @param callback is made when the connection has been established or when a connection error.
         */
        void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port, connect_cb callback);

        /**
         * Accept connection from remote TCP socket and return his handle.
         *
         * @param result is pointer to accepting result (optional, ignored if nullptr).
         * If isError(*result) returns true - use getError(*result) to determine the error.
         * If isError(*result) returns false - connection successfully accepted.
         * @return pointer to handle of accepted connection (@see IOTCP).
         */
        IOTCP* accept(ssize_t* result = nullptr);

        /**
         * Accept connection on self TCP socket from server listening TCP socket.
         *
         * @param listenSocket is pointer to handle of listening TCP socket.
         * @return accepting result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - connection successfully accepted.
         */
        int acceptFromListeningSocket(IOTCP* listenSocket);

        /**
         * Stop reading from TCP socket.
         */
        void stopRead();

        /**
         * Enable keep-alive mode for TCP connection.
         *
         * @param delay is the initial delay in seconds.
         * @return enabling keep-alive mode result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - keep-alive mode successfully enabled.
         */
        int enableKeepAlive(unsigned int delay);

        /**
         * Disable keep-alive mode for TCP connection.
         *
         * @return disabling keep-alive mode result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - keep-alive mode successfully disabled.
         */
        int disableKeepAlive();

        /**
         * Get pointer to struct with TCP socket data.
         * For internal usage.
         *
         * @return pointer to struct with TCP socket data.
         */
        ioTCPSocket* getTCPSocket();

        /**
         * Check read queue on TCP socket and start next read task if necessary.
         * For internal usage.
         */
        void checkReadQueue();

        /**
         * Set connection reset flag.
         * For internal usage.
         */
        void setConnectionReset();

    private:
        ioLoop* loop;
        uv_tcp_t* ioTCPSoc;
        uv_connect_t ioConnection;

        std::atomic<bool> closed = false;
        std::atomic<bool> tcpReading = false;
        std::atomic<bool> connReset = false;
        ioHandle_t type;

        std::queue<socketRead_data> readQueue;

        bool initTCPSocket();
        void freeRequest();

        static bool isIPv4(const char *ip);

        static void _listen_cb(uv_stream_t *stream, int result);
        static void _connect_cb(uv_connect_t* connect, int result);
        static void _alloc_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _allocBuffer_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _read_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
        static void _readBuffer_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
        static void _write_tcp_cb(uv_write_t* req, int status);
        static void _close_handle_cb(uv_handle_t* handle);
    };
}

#endif //U8_IOTCP_H
