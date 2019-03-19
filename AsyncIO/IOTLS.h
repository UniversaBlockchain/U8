//
// Created by Tairov Dmitriy on 01.03.19.
//

#ifndef U8_IOTLS_H
#define U8_IOTLS_H

#include "IOTCP.h"

#include "TLS/evt_tls.h"
#include "TLS/uv_tls.h"

namespace asyncio {

    /**
     * Context of TLS connection.
     */
    typedef evt_ctx_t ioTLSContext;

    class IOTLS;

    /**
     * Socket accept callback with TLS. Call from IOTLS::accept after accept TLS connection.
     * Callback called when the connection has been established and a successful TLS handshake is made
     * or when a connection error.
     *
     * @param handle is pointer to handle of accepted connection (@see IOTLS).
     * @param result is accept TCP connection and TLS handshake result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - TLS connection successfully accepted.
     */
    typedef std::function<void(IOTLS* handle, ssize_t result)> accept_cb;

    struct TLS_data {
        ioTLSContext* TLScontext;
        uv_tls_t* tls;
    };

    struct connect_accept_TLS_data {
        TLS_data* tls_data;
        connect_cb connect_callback;
        accept_cb accept_callback;
        close_cb close_callback;
        IOTLS* handle;
        uv_timer_t* timer;
        unsigned int timeout;
        bool handshake;
        bool connReset;
    };

    struct closeTLS_data {
        TLS_data* tls_data;
        close_cb callback;
        bool connReset;
        IOTLS* handle;
    };

    struct readTLS_data {
        read_cb callback;
        size_t maxBytesToRead;
        IOTLS* handle;
    };

    struct readBufferTLS_data {
        readBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRead;
        IOTLS* handle;
    };

    /**
     * Asynchronous TCP socket with TLS encryption.
     */
    class IOTLS : public IOHandleThen {
    public:
        IOTLS(AsyncLoop* loop = nullptr);
        ~IOTLS();

        /**
         * Asynchronous read from TLS socket.
         *
         * @param maxBytesToRead is maximum number of bytes to read from TLS socket.
         * @param callback caused when reading from TLS socket or error.
         */
        void read(size_t maxBytesToRead, read_cb callback);

        /**
         * Asynchronous read from TLS socket to initialized buffer.
         *
         * @param buffer is initialized buffer for read from TLS socket, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from TLS socket.
         * @param callback caused when reading from TLS socket or error.
         */
        void read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback);

        /**
         * Asynchronous write to TLS socket.
         *
         * @param data is byte vector for data written to TLS socket.
         * @param callback caused when writing to TLS socket or error.
         */
        void write(const byte_vector& data, write_cb callback);

        /**
         * Asynchronous write to TLS socket from buffer.
         *
         * @param buffer contains data written to TLS socket.
         * @param size of buffer in bytes.
         * @param callback caused when writing to TLS socket or error.
         */
        void write(void* buffer, size_t size, write_cb callback);

        /**
         * Asynchronous close TLS socket.
         *
         * @param callback caused when closing a TLS socket or error.
         */
        void close(close_cb callback);

        /**
        * Asynchronous init, bind and start listening socket for incoming connections.
        * Use SSL/TLS for decrypt connection.
        *
        * @param IP address (IPv4 or IPv6).
        * @param port for binding socket.
        * @param certFilePath is path to PEM file with certificate.
        * @param keyFilePath is path to PEM file with key.
        * @param callback is called when a new incoming connection is received or error.
        * @param maxConnections indicates the number of connections the kernel might queue.
        */
        void open(const char* IP, unsigned int port, const char* certFilePath, const char* keyFilePath,
                openTCP_cb callback, int maxConnections = SOMAXCONN);

        /**
         * Asynchronous init, bind and establish an IPv4 or IPv6 TLS connection.
         * Use SSL/TLS for decrypt connection.
         *
         * @param IP address for bind socket (IPv4 or IPv6).
         * @param port for bind socket.
         * @param IP address of remote socket (IPv4 or IPv6).
         * @param port of remote socket.
         * @param certFilePath is path to PEM file with certificate.
         * @param keyFilePath is path to PEM file with key.
         * @param callback is made when the connection has been established and a successful TLS handshake is made.
         * @param timeout (in milliseconds) waiting for a TLS handshake before calling a callback with an error
         *        and auto close socket (optional, default 5000 ms). Set to 0 for endless waiting.
         */
        void connect(const char* bindIP, unsigned int bindPort, const char* IP, unsigned int port,
                        const char* certFilePath, const char* keyFilePath, connect_cb callback, unsigned int timeout = 5000);

        /**
        * Accept TLS connection from remote TCP socket and return pointer to his handle.
        * Delete returning handle IOTLS after his closing.
        *
        * @param callback is made when the connection has been accepted and a successful TLS handshake is made
        * or when a accept error.
        * @param timeout (in milliseconds) waiting for a TLS handshake before calling a callback with an error
        *        and auto close socket (optional, default 5000 ms). Set to 0 for endless waiting.
        * @return pointer to handle of accepted connection (@see IOTLS).
        */
        IOTLS* accept(accept_cb callback, unsigned int timeout = 5000);

        /**
         * Accept TLS connection on self TCP socket from server listening TCP socket.
         *
         * @param listenSocket is pointer to handle of  listening TCP socket.
         * @param callback is made when the connection has been accepted or when a accept error.
         * @param timeout (in milliseconds) waiting for a TLS handshake before calling a callback with an error
         *        (optional, default 5000 ms). Set to 0 for endless waiting.
         * @return accepting result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - connection successfully accepted.
         */
        int acceptFromListeningSocket(IOTLS* listenSocket, accept_cb callback, unsigned int timeout);

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
         * Check read queue on TLS socket and start next read task if necessary.
         * For internal usage.
         */
        void checkReadQueue();

        /**
         * Get pointer to struct with TCP socket data.
         * For internal usage.
         *
         * @return pointer to struct with TCP socket data.
         */
        ioTCPSocket* getTCPSocket();

        /**
         * Get pointer to context of TLS connection.
         *
         * @return pointer to context of TLS connection.
         */
        ioTLSContext* getTLSContext();

        /**
         * Set connection reset flag.
         * For internal usage.
         */
        void setConnectionReset();

        /**
         * Stop own asynchronous loop (if initialized).
         * For internal usage.
         */
        void stopOwnLoop();

        /**
         * Add data to queue.
         * For internal usage.
         *
         * @param buff is data buffer.
         * @param len is data length.
         */
        void addDataToQueue(char* buff, size_t len);

    private:
        ioLoop* loop;
        uv_tcp_t* ioTCPSoc;
        uv_connect_t ioConnection;
        TLS_data tls_data;

        std::atomic<bool> closed = false;
        std::atomic<bool> bufferized = false;
        std::atomic<bool> tlsReading = false;
        std::atomic<bool> connReset = false;
        std::atomic<bool> accepted = false;
        ioHandle_t type;

        Queue<socketRead_data> readQueue;
        Queue<char> dataQueue;

        AsyncLoop* aloop = nullptr;
        bool ownLoop;

        bool initTCPSocket();
        void freeRequest();

        void freeReadData();

        static bool isIPv4(const char *ip);

        // async works
        void _write(const byte_vector& data, write_cb callback);
        void _write(void* buffer, size_t size, write_cb callback);
        void _close(close_cb callback);
        void _connect(std::string bindIP, unsigned int bindPort, std::string IP, unsigned int port,
                      std::string certFilePath, std::string keyFilePath, connect_cb callback, unsigned int timeout);

        static void _listen_cb(uv_stream_t *stream, int result);
        static void _connect_cb(uv_connect_t* connect, int result);
        static void _read_tls_cb(uv_tls_t* tls, ssize_t nread, const uv_buf_t* buf);
        static void _readBuffer_tls_cb(uv_tls_t* tls, ssize_t nread, const uv_buf_t* buf);
        static void _write_tls_cb(uv_tls_t* tls, int status);
        static void _close_handle_cb(uv_handle_t* handle);
        static void _connect_cb_tls_handshake(uv_tls_t *tls, int status);
        static void _accept_cb_tls_handshake(uv_tls_t *tls, int status);
    };
}

#endif //U8_IOTLS_H
