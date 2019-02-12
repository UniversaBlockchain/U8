//
// Created by Dmitriy Tairov on 12.01.19.
//

#ifndef U8_ASYNCIO_H
#define U8_ASYNCIO_H

#include <uv.h>
#include <vector>
#include <functional>
#include <memory>
#include <future>
#include <queue>
#include <any>

namespace asyncio {

#define WAIT_LOOP 5000000L

    /**
     * Exit handle for deinitialize main asynchronous loop.
     */
    extern uv_async_t exitHandle;

    /**
     * Handle of main asynchronous loop.
     */
    extern uv_loop_t* asyncLoop;

    /**
     * Handle of main asynchronous loop thread.
     */
    extern uv_thread_t thread_loop;

    /**
     * Alarm (event notify) handle of main asynchronous loop.
     */
    extern uv_async_t alarmHandle;

    /**
     * Asynchronous request for file operations.
     */
    typedef uv_fs_t ioHandle;

    /**
     * Directory entry for scan directory.
     */
    typedef uv_dirent_t ioDirEntry;

    /**
     * Struct with stats of file or directory.
     */
    typedef uv_stat_t ioStat;

    /**
     * Asynchronous loop (for auxiliary loops).
     */
    typedef uv_loop_t ioLoop;

    /**
     * TCP socket struct (using for accept).
     */
    typedef uv_tcp_t ioTCPSocket;

    /**
     * Byte vector.
     */
    typedef std::vector<uint8_t> byte_vector;

    /**
     * IO handle type.
     */
    enum ioHandle_t {
        FILE,
        DIRECTORY,
        TCP_SOCKET_LISTEN,
        TCP_SOCKET_CONNECTED,
        UDP_SOCKET,
        TCP_SOCKET_ERROR,
        UDP_SOCKET_ERROR
    };

    /**
     * File open callback.
     *
     * @param result is file open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(ssize_t result)> openFile_cb;

    /**
     * File or TCP socket read callback.
     *
     * @param data is byte vector with data read from file or TCP socket.
     * @param result is reading result from file or TCP socket.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(const byte_vector& data, ssize_t result)> read_cb;

    /**
     * File or TCP socket read callback with initialized buffer.
     *
     * @param result is reading result from file or TCP socket.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(ssize_t result)> readBuffer_cb;

    /**
     * File or TCP socket write callback.
     *
     * @param result is file or TCP socket write result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes wrote.
     */
    typedef std::function<void(ssize_t result)> write_cb;

    /**
     * File or socket close callback.
     *
     * @param result is file close result (ignored for closing socket).
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is closed.
     */
    typedef std::function<void(ssize_t result)> close_cb;

    /**
     * Get stat callback.
     *
     * @param stat is gotten stat.
     * stat struct contains:
     *     uint64_t st_dev - device
     *     uint64_t st_mode - file mode
     *     uint64_t st_nlink - link count
     *     uint64_t st_uid - user ID of the file's owner
     *     uint64_t st_gid - group ID of the file's group
     *     uint64_t st_rdev - device number, if device
     *     uint64_t st_ino - file serial number
     *     uint64_t st_size - size of file, in bytes;
     *     uint64_t st_blksize - optimal block size for I/O
     *     uint64_t st_blocks - number 512-byte blocks allocated
     *     timespec st_atim - time of last access
     *     timespec st_mtim - time of last modification
     *     timespec st_ctim - time of last status change

     * @param result is get stat result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result of getting stat.
     */
    typedef std::function<void(ioStat stat, ssize_t result)> stat_cb;

    /**
     * Directory open callback.
     *
     * @param result is directory open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened directory.
     */
    typedef std::function<void(ssize_t result)> openDir_cb;

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

    /**
     * Listen socket callback. Call from IOHandle::openTCP after init, bind and listen TCP socket.
     * Callback called when a new incoming connection is received or error.
     *
     * @param result is listen TCP socket result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - TCP socket ready to accept new connection.
     */
    typedef std::function<void(ssize_t result)> openTCP_cb;

    /**
     * Socket connect callback. Call from IOHandle::connect after init, bind and establish an IPv4 or IPv6 TCP connection.
     * Callback called when the connection has been established or when a connection error.
     *
     * @param result is connect TCP socket result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - TCP socket successfully connected.
     */
    typedef std::function<void(ssize_t result)> connect_cb;

    class IOHandle;

    struct openFile_data {
        openFile_cb callback;
        ioHandle* fileReq;
    };

    struct read_data {
        read_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
        size_t pos;
        size_t maxBytes;
        std::shared_ptr<byte_vector> data;
        uv_timer_t* timer;
        size_t block;
        size_t readed;
    };

    struct readBuffer_data {
        readBuffer_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
    };

    struct write_data {
        write_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
        std::shared_ptr<byte_vector> data;
    };

    struct closeFile_data {
        close_cb callback;
        ioHandle* fileReq;
    };

    struct stat_data {
        stat_cb callback;
        ioHandle* req;
    };

    struct auxLoop_data {
        uv_async_t* loop_exitHandle;
        uv_async_t* loop_alarmHandle;
        uv_thread_t* thread_auxLoop;
    };

    struct recv_data {
        recv_cb callback;
        std::shared_ptr<byte_vector> data;
    };

    struct recvBuffer_data {
        recvBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRecv;
    };

    struct send_data {
        send_cb callback;
        uv_udp_send_t* req;
        uv_buf_t uvBuff;
        std::shared_ptr<byte_vector> data;
    };

    struct closeSocket_data {
        close_cb callback;
        bool connReset;
    };

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
        IOHandle* handle;
    };

    struct readBufferTCP_data {
        readBuffer_cb callback;
        void* buffer;
        size_t maxBytesToRead;
        IOHandle* handle;
    };

    struct writeTCP_data {
        write_cb callback;
        uv_write_t* req;
        uv_buf_t uvBuff;
        std::shared_ptr<byte_vector> data;
        bool connReset;
    };

    struct tcpRead_data {
        void* data;
        bool bufferized;
    };

    /**
     * Init and run main asynchronous loop.
     * Must be called before asynchronous method calls.
     */
    ioLoop* initAndRunLoop();

    /**
     * Get handle of main asynchronous loop.
     */
    inline ioLoop* getMainLoop() { return asyncLoop; };

    /**
     * Send notification to main asynchronous loop about event.
     */
    void alarmLoop();

    /**
     * Deinitialize main asynchronous loop.
     * Must be called after asynchronous method calls.
     */
    void deinitLoop();

    /**
     * Init and run auxiliary asynchronous loop.
     *
     * @return handle of auxiliary asynchronous loop.
     */
    ioLoop* initAndRunAuxLoop();

    /**
     * Send notification to loop about event.
     *
     * @param loop is handle of auxiliary asynchronous loop.
     */
    void alarmAuxLoop(ioLoop* loop);

    /**
     * Deinitialize auxiliary asynchronous loop.
     * Must be called after asynchronous method calls in auxiliary asynchronous loop.
     *
     * @param loop is handle of auxiliary asynchronous loop.
     */
    void deinitAuxLoop(ioLoop* loop);

    /**
     * Check result for error.
     *
     * @param result from asynchronous callback.
     * @return true - if an error occurred,
     *         false - if the result is successful.
     */
    bool isError(ssize_t result);

    /**
     * Get error description by result.
     * isError(result) must be returned true.
     *
     * @param code is result from asynchronous callback.
     * @return error description.
     */
    const char* getError(ssize_t code);

    /**
     * Check whether the entry is a file.
     *
     * @param entry is directory entry (@see IOHandle::next).
     * @return true - if the entry is a file,
     *         false - if otherwise.
     */
    bool isFile(const ioDirEntry& entry);

    /**
     * Check whether the entry is a directory.
     *
     * @param entry is directory entry (@see IOHandle::next).
     * @return true - if the entry is a directory,
     *         false - if otherwise.
     */
    bool isDir(const ioDirEntry& entry);

    /**
     * Class for asynchronous work with files.
     */
    class IOHandle {
    public:
        IOHandle(ioLoop* loop = asyncLoop);
        ~IOHandle();

        /**
         * Asynchronous open file.
         *
         * @param path to open file
         * @param flags:
         *    O_RDONLY - open file read only
         *    O_WRONLY - open file write only
         *    O_RDWR - open file for reading and writing
         *    O_CREAT - if path does not exist, create it as a regular file
         *    O_TRUNC - if the file already exists and is a regular file and the
                        access mode allows writing (i.e., is O_RDWR or O_WRONLY) it
                        will be truncated to length 0.
         *    O_APPEND - file is opened in append mode
         * @param mode - specifies the file mode bits be applied when a new file is created:
         *    S_IRWXU  00700 user (file owner) has read, write, and execute permission
         *    S_IRUSR  00400 user has read permission
         *    S_IWUSR  00200 user has write permission
         *    S_IXUSR  00100 user has execute permission
         *    S_IRWXG  00070 group has read, write, and execute permission
         *    S_IRGRP  00040 group has read permission
         *    S_IWGRP  00020 group has write permission
         *    S_IXGRP  00010 group has execute permission
         *    S_IRWXO  00007 others have read, write, and execute permission
         *    S_IROTH  00004 others have read permission
         *    S_IWOTH  00002 others have write permission
         *    S_IXOTH  00001 others have execute permission
         * @param callback caused when opening a file or error.
         */
        void open(const char* path, int flags, int mode, openFile_cb callback);

        /**
         * Asynchronous read file or TCP socket.
         *
         * @param maxBytesToRead is maximum number of bytes to read from file or TCP socket.
         * @param callback caused when reading a file or TCP socket or error.
         */
        void read(size_t maxBytesToRead, read_cb callback);

        /**
         * Asynchronous read file or TCP socket to initialized buffer.
         *
         * @param buffer is initialized buffer for read from file or TCP socket, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from file or TCP socket.
         * @param callback caused when reading a file or TCP socket or error.
         */
        void read(void* buffer, size_t maxBytesToRead, readBuffer_cb callback);

        /**
         * Asynchronous write file or TCP socket.
         *
         * @param data is byte vector for data written to file or TCP socket.
         * @param callback caused when writing a file or TCP socket or error.
         */
        void write(const byte_vector& data, write_cb callback);

        /**
         * Asynchronous write file or TCP socket from buffer.
         *
         * @param buffer contains data written to file or TCP socket.
         * @param size of buffer in bytes.
         * @param callback caused when writing a file or TCP socket or error.
         */
        void write(void* buffer, size_t size, write_cb callback);

        /**
         * Asynchronous close file or socket.
         *
         * @param callback caused when closing a file/socket or error.
         */
        void close(close_cb callback);

        /**
         * Asynchronous opening of a file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open file.
         * @param flags (@see IOHandle::open(const char* path, int flags, int mode, openFile_cb callback)).
         * @param mode - specifies the file mode bits be applied when a new file is created
         *              (@see IOHandle::open(const char* path, int flags, int mode, openFile_cb callback)).
         * @return pointer to open file handle.
         */
        IOHandle* open(const char* path, int flags, int mode);

        /**
         * Asynchronous read file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(readFile_cb callback).
         *
         * @param maxBytesToRead is maximum number of bytes to read from file.
         * @return pointer to open file handle.
         */
        IOHandle* read(size_t maxBytesToRead);

        /**
         * Asynchronous write file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param data is byte vector for data written to file.
         * @return pointer to open file handle.
         */
        IOHandle* write(const byte_vector& data);

        /**
         * Asynchronous close file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @return pointer to open file handle.
         */
        IOHandle* close();

        /**
         * Callback initialization for asynchronous opening, writing and closing file and open directory for scan.
         * Used when the callback has not been initialized in methods IOHandle::open, IOHandle::write, IOHandle::close
         * and IOHandle::openDir.
         * @see IOHandle::open(const char* path, int flags, int mode).
         * @see IOHandle::write(const byte_vector& data).
         * @see IOHandle::close().
         * @see IOHandle::openDir(const char* path).
         *
         * @param callback is initialized callback for asynchronous opening, writing and closing file or scan directory.
         * @return pointer to open file handle.
         */
        IOHandle* then(openFile_cb callback);

        /**
         * Callback initialization for asynchronous reading file.
         * Used when the callback has not been initialized in method IOHandle::read.
         * @see IOHandle::read(size_t maxBytesToRead).
         *
         * @param callback is initialized callback for asynchronous reading file.
         * @return pointer to open file handle.
         */
        IOHandle* then(read_cb callback);

        /**
         * Asynchronous open directory for scan.
         *
         * @param path to open directory.
         * @param callback caused when opening a directory or error.
         */
        void openDir(const char* path, openDir_cb callback);

        /**
         * Get next entry for scan directory.
         *
         * Directory entry is struct with fields:
         *      name - is name of file or directory
         *      type - is type of directory entry.
         * For check entry is file use isFile(entry).
         * @see isFile(const ioDirEntry& entry).
         * For check entry is directory use isDir(entry).
         * @see isDir(const ioDirEntry& entry).
         *
         * @param entry is pointer to next directory entry.
         * @return true - if a entry is successfully get,
         *         false - if can`t get a entry (reached the end of the directory).
         */
        bool next(ioDirEntry *entry);

        /**
         * Asynchronous open directory for scan with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open directory.
         * @return pointer to open file handle.
         */
        IOHandle* openDir(const char* path);

        /**
         * Initialize UPD socket and bind to IP and port.
         *
         * @param IP address (IPv4 or IPv6).
         * @param port for binding socket.
         * @return initialize and bind UPD socket result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - UPD socket successfully init and bind.
         */
        int openUDP(const char* IP, unsigned int port);

        /**
         * Asynchronous receive data from UDP socket.
         * Callback of this method can be called multiple times, each time data is received,
         * until the method IOHandle::stopRecv is called.
         *
         * @param callback caused when receiving a data or error.
         */
        void recv(recv_cb callback);

        /**
         * Asynchronous receive data from UDP socket to initialized buffer.
         * Callback of this method can be called multiple times, each time data is received,
         * until the method IOHandle::stopRecv is called.
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
         * Stop receive data from UDP socket or read from TCP socket.
         */
        void stopRecv();

        /**
         * Asynchronous init, bind and start listening socket for incoming connections.
         *
         * @param IP address (IPv4 or IPv6).
         * @param port for binding socket.
         * @param callback is called when a new incoming connection is received or error.
         * @param maxConnections indicates the number of connections the kernel might queue.
         */
        void openTCP(const char* IP, unsigned int port, openTCP_cb callback, int maxConnections = SOMAXCONN);

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
         * @return handle of accepted connection (@see IOHandle).
         */
        std::shared_ptr<IOHandle> accept(ssize_t* result = nullptr);

        /**
         * Accept connection on self TCP socket from server listening TCP socket.
         * Method for internal usage. Use IOHandle::accept.
         *
         * @param listenSocket is pointer to handle of listening TCP socket.
         * @return accepting result.
         * If isError(result) returns true - use getError(result) to determine the error.
         * If isError(result) returns false - connection successfully accepted.
         */
        int acceptFromListeningSocket(IOHandle* listenSocket);

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
         * Get pointer to struct with TCP socket.
         *
         * @return pointer to struct with TCP socket.
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

        uv_fs_t* ioReq;
        uv_tcp_t* ioTCPSoc;
        uv_udp_t* ioUDPSoc;
        uv_connect_t ioConnection;

        std::atomic<bool> closed = false;
        std::atomic<bool> bufferized = false;
        std::atomic<bool> tcpReading = false;
        std::atomic<bool> connReset = false;
        ioHandle_t type;

        std::packaged_task<void(openFile_cb)> task;
        std::packaged_task<void(read_cb)> readTask;

        std::queue<tcpRead_data> readQueue;

        bool initRequest();
        bool initUDPSocket();
        bool initTCPSocket();

        void freeRequest();
        void freeReadData();

        static bool isIPv4(const char *ip);

        static void _open_cb(asyncio::ioHandle *req);
        static void _read_cb(asyncio::ioHandle *req);
        static void _write_cb(asyncio::ioHandle *req);
        static void _close_cb(asyncio::ioHandle *req);
        static void _readBuffer_cb(asyncio::ioHandle *req);

        static void _alloc_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _allocBuffer_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _recv_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
        static void _recvBuffer_cb(uv_udp_t* handle, ssize_t nread, const uv_buf_t* buf, const struct sockaddr* addr, unsigned flags);
        static void _send_cb(uv_udp_send_t* req, int status);
        static void _close_handle_cb(uv_handle_t* handle);

        static void _listen_cb(uv_stream_t *stream, int result);
        static void _connect_cb(uv_connect_t* connect, int result);
        static void _alloc_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _allocBuffer_tcp_cb(uv_handle_t* handle, size_t suggested_size, uv_buf_t* buf);
        static void _read_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
        static void _readBuffer_tcp_cb(uv_stream_t* stream, ssize_t nread, const uv_buf_t* buf);
        static void _write_tcp_cb(uv_write_t* req, int status);
    };

    /**
     * File open callback for method asyncio::file::open.
     *
     * @param handle is shared pointer to open file handle.
     * @param result is file open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(std::shared_ptr<IOHandle> handle, ssize_t result)> openIOHandle_cb;

    /**
     * File remove callback.
     *
     * @param result is file remove result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is removed.
     */
    typedef std::function<void(ssize_t result)> removeFile_cb;

    class file {
    public:
        /**
         * Max size of file for readFile and writeFile.
         */
        static const unsigned int MAX_FILE_SIZE = 10485760;

        /**
         * Asynchronous opening of a file with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file.
         * @param flags (@see IOHandle::open).
         * @param mode - specifies the file mode bits be applied when a new file is created (@see IOHandle::open).
         * @param callback caused when opening a file or error.
         */
        static void open(const char* path, int flags, int mode, openIOHandle_cb callback);

        /**
         * Asynchronous opening of a file for reading with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file.
         * @param callback caused when opening a file or error.
         */
        static void openRead(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronous opening of a file for writing with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file.
         * @param callback caused when opening a file or error.
         */
        static void openWrite(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronous open and read the entire contents of the file.
         *
         * @param path to open file.
         * @param callback when the file is read or an error occurs.
         */
        static void readFile(const char* path, read_cb callback);

        /**
         * Asynchronous open and read the part of the file.
         *
         * @param path to open file.
         * @param pos is starting position in the file for reading.
         * @param maxBytesToRead is maximum number of bytes to read from file.
         * @param callback when the part of the file is read or an error occurs.
         * @param timeout for read file in milliseconds. If the timeout is reached, the file reading is terminated
         *        and the read data in the callback is returned (default 0 - without timeout).
         * @param blockSize is size of block for reading. If the timeout is reached, only read blocks are returned.
         *        If timeout is 0 - parameter is ignored. Default - 8192 bytes.
         */
        static void readFilePart(const char* path, size_t pos, size_t maxBytesToRead, read_cb callback,
                unsigned int timeout = 0, size_t blockSize = 8192);

        /**
         * Asynchronous open and write the file.
         *
         * @param path to open file.
         * @param data is byte vector for data written to file.
         * @param callback when the file is wrote or an error occurs.
         */
        static void writeFile(const char* path, const byte_vector& data, write_cb callback);

        /**
         * Asynchronous get stat of a file or directory.
         *
         * @param path to file or directory.
         * @param callback caused when getting stat or error.
         */
        static void stat(const char* path, stat_cb callback);

        /**
         * Asynchronous opening of a file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open file.
         * @param flags (@see IOHandle::open).
         * @param mode - specifies the file mode bits be applied when a new file is created (@see IOHandle::open).
         * @return pointer to open file handle.
         */
        static IOHandle* open(const char* path, int flags, int mode);

        /**
         * Asynchronous remove file.
         *
         * @param path to removed file.
         * @param callback when the file is removed or an error occurs.
         */
        static void remove(const char* path, removeFile_cb callback);

    private:
        static void readFile_onClose(asyncio::ioHandle *req);
        static void readFile_onRead(asyncio::ioHandle *req);
        static void readFile_onStat(asyncio::ioHandle *req);
        static void readFile_onOpen(asyncio::ioHandle *req);

        static void writeFile_onClose(asyncio::ioHandle *req);
        static void writeFile_onWrite(asyncio::ioHandle *req);
        static void writeFile_onOpen(asyncio::ioHandle *req);

        static void remove_onRemoveFile(asyncio::ioHandle *req);
        static void readFilePart_onTimeout(uv_timer_t* handle);

        static void stat_onStat(asyncio::ioHandle *req);
    };

    /**
     * Directory create callback.
     *
     * @param result is directory create result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is created.
     */
    typedef std::function<void(ssize_t result)> createDir_cb;

    /**
     * Directory remove callback.
     *
     * @param result is directory remove result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is removed.
     */
    typedef std::function<void(ssize_t result)> removeDir_cb;

    class dir {
    public:
        /**
         * Asynchronous create directory.
         *
         * @param path to created directory.
         * @param mode - specifies the directory mode bits be applied when a new directory is created (@see IOHandle::open).
         * @param callback when the directory is created or an error occurs.
         */
        static void createDir(const char* path, int mode, createDir_cb callback);

        /**
         * Asynchronous remove directory.
         *
         * @param path to removed directory.
         * @param callback when the directory is removed or an error occurs.
         */
        static void removeDir(const char* path, removeDir_cb callback);

        /**
         * Asynchronous get stat of a file or directory.
         *
         * @param path to file or directory.
         * @param callback caused when getting stat or error.
         */
        static void stat(const char* path, stat_cb callback);

    private:
        static void dir_onCreateOrRemove(asyncio::ioHandle *req);
    };
};

#endif //U8_ASYNCIO_H
