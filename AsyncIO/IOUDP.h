//
// Created by Tairov Dmitriy on 10.02.19.
//

#ifndef U8_IOUDP_H
#define U8_IOUDP_H

#include "AsyncIO.h"
#include "IOHandle.h"
#include "IOHandleThen.h"

namespace asyncio {

    /**
     * UDP socket receive callback, which is called when the endpoint receives data.
     *
     * @param result is receiving result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of received bytes.
     * @param data is byte vector with data received from remote socket.
     * @param IP address of remote socket (IPv4 or IPv6).
     * @param port of remote socket.
     */
    typedef std::function<void(ssize_t result, const byte_vector& data, const char* IP, unsigned int port)> recv_cb;

    /**
     * UDP socket receive callback with initialized buffer, which is called when the endpoint receives data.
     *
     * @param result is receiving result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of received bytes.
     * @param IP address of remote socket (IPv4 or IPv6).
     * @param port of remote socket.
     */
    typedef std::function<void(ssize_t result, const char* IP, unsigned int port)> recvBuffer_cb;

    /**
     * UDP socket send callback, which is called after the data was sent.
     *
     * @param result is receiving result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of sent bytes.
     */
    typedef std::function<void(ssize_t result)> send_cb;

    class IOUDP;

    struct recv_data {
        recv_cb callback;
    };

    struct recvBuffer_data {
        recvBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRecv;
    };

    struct readUDP_data {
        read_cb callback;
        std::shared_ptr<byte_vector> data;
        size_t maxBytesToRead;
        IOUDP* handle;
        std::string IP;
        unsigned int port;
    };

    struct readUDPBuffer_data {
        readBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRead;
        IOUDP* handle;
        std::string IP;
        unsigned int port;
    };

    struct send_data {
        send_cb callback;
        uv_udp_send_t* req;
        uv_buf_t uvBuff;
        std::shared_ptr<byte_vector> data;
    };

    // common sockets structs
    struct closeSocket_data {
        close_cb callback;
        bool connReset;
    };

    struct socketRead_data {
        void* data;
        bool bufferized;
    };

    /**
     * Asynchronous UDP socket.
     */
    class IOUDP : public IOHandleThen {
    public:
        IOUDP(ioLoop* loop = asyncLoop);
        ~IOUDP();

        /**
         * Asynchronous read from UDP socket.
         *
         * @param maxBytesToRead is maximum number of bytes to read from UDP socket.
         * @param callback caused when reading from UDP socket or error.
         */
        void read(size_t maxBytesToRead, read_cb callback);

        /**
         * Asynchronous read from UDP socket to initialized buffer.
         *
         * @param buffer is initialized buffer for read from UDP socket, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from UDP socket.
         * @param callback caused when reading from UDP socket or error.
         */
        void read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback);

        /**
         * Asynchronous write to UDP socket.
         *
         * @param data is byte vector for data written to UDP socket.
         * @param callback caused when writing to UDP socket or error.
         */
        void write(const byte_vector& data, write_cb callback);

        /**
         * Asynchronous write to UDP socket from buffer.
         *
         * @param buffer contains data written to UDP socket.
         * @param size of buffer in bytes.
         * @param callback caused when writing to UDP socket or error.
         */
        void write(void* buffer, size_t size, write_cb callback);

        /**
         * Asynchronous close UDP socket.
         *
         * @param callback caused when closing a UDP socket or error.
         */
        void close(close_cb callback);

        /**
         * Initialize UPD socket and bind to IP and port.
         *
         * @param IP address (IPv4 or IPv6).
         * @param port for binding socket.
         * @return initialize and bind UPD socket result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - UPD socket successfully init and bind.
         */
        int open(const char* IP, unsigned int port);

        /**
         * Asynchronous receive data from UDP socket.
         * Callback of this method can be called multiple times, each time data is received,
         * until the method IOUDP::stopRecv is called.
         *
         * @param callback caused when receiving a data or error.
         */
        void recv(recv_cb callback);

        /**
         * Asynchronous receive data from UDP socket to initialized buffer.
         * Callback of this method can be called multiple times, each time data is received,
         * until the method IOUDP::stopRecv is called.
         *
         * @param buffer is initialized buffer for receive data from socket, buffer size must be at least maxBytesToRecv.
         * @param maxBytesToRecv is maximum number of bytes to receive from socket.
         * @param callback caused when receiving a data or error.
         */
        void recv(void* buffer, size_t maxBytesToRecv, recvBuffer_cb callback);

        /**
         * Asynchronous send data to UDP socket.
         *
         * @param data is byte vector for data sent to socket.
         * @param IP address of remote socket (IPv4 or IPv6).
         * @param port of remote socket.
         * @param callback caused when sending a data or error.
         */
        void send(const byte_vector& data, const char* IP, unsigned int port, send_cb callback);

        /**
         * Asynchronous send data to UDP socket from buffer.
         *
         * @param buffer contains data sent to socket.
         * @param size of buffer in bytes.
         * @param IP address of remote socket (IPv4 or IPv6).
         * @param port of remote socket.
         * @param callback caused when sending a data or error.
         */
        void send(void* buffer, size_t size, const char* IP, unsigned int port, send_cb callback);

        /**
         * Stop receive data from UDP socket. UDP socket goes out of receive mode.
         */
        void stopRecv();

        /**
         * Stop wait reading data from UDP socket. UDP socket goes out of read mode.
         */
        void stopRead();

        /**
         * Check read queue on UDP socket (in read mode) and start next read task if necessary.
         * For internal usage.
         */
        void checkReadQueue();

        /**
         * Set default remote IP address and port for read/write data from UDP socket for read mode.
         * When you call method IOUDP::write, the datagram is sent to the specified address and port.
         * When you call method IOUDP::read, expected to receive a datagram from the specified address and port.
         * @see IOUDP::write(const byte_vector& data, write_cb callback)
         * @see IOUDP::write(void* buffer, size_t size, write_cb callback)
         * @see IOUDP::read(size_t maxBytesToRead, read_cb callback)
         * @see IOUDP::read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback)
         *
         * @param IP address of remote socket by default (IPv4 or IPv6).
         * @param port of remote socket by default.
         */
        void setDefaultAddress(const char* IP, unsigned int port);

    private:
        ioLoop* loop;
        uv_udp_t* ioUDPSoc;

        std::atomic<bool> closed = false;
        std::atomic<bool> bufferized = false;
        std::atomic<bool> readMode = false;
        std::atomic<bool> recvMode = false;
        ioHandle_t type;

        std::string defaultIP;
        unsigned int defaultPort = 0;

        std::queue<socketRead_data> readQueue;

        bool initUDPSocket();
        void freeRequest();
        void freeRecvData();

        static bool isIPv4(const char *ip);

        static void _alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _allocBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
        static void _recvBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
        static void _send_cb(uv_udp_send_t* req, int status);
        static void _close_handle_cb(uv_handle_t* handle);

        // for read mode
        static void _alloc_read_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _alloc_readBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _read_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
        static void _readBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
    };
}

#endif //U8_IOUDP_H
