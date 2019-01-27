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
    /**
     * Exit handle for deinitialize main asynchronous loop
     */
    extern uv_async_t exitHandle;

    /**
     * Handle of main asynchronous loop
     */
    extern uv_loop_t* asyncLoop;

    /**
     * Asynchronous request
     */
    typedef uv_fs_t ioHandle;

    typedef uv_dirent_t ioDirEntry;

    typedef uv_stat_t ioStat;

    /**
     * Byte vector
     */
    typedef std::vector<uint8_t> byte_vector;

    /**
     * IO handle type
     */
    enum ioHandle_t {
        FILE,
        DIRECTORY,
        TCP_SOCKET,
        UDP_SOCKET
    };

    /**
     * File open callback
     *
     * @param result is file open result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(ssize_t result)> openFile_cb;

    /**
     * File read callback
     *
     * @param data is byte vector with data read from file
     * @param result is reading result from file
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(const byte_vector& data, ssize_t result)> readFile_cb;

    /**
     * File read callback with initialized buffer
     *
     * @param result is reading result from file
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes read.
     */
    typedef std::function<void(ssize_t result)> readFileBuffer_cb;

    /**
     * File write callback
     *
     * @param result is file write result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is number of bytes wrote.
     */
    typedef std::function<void(ssize_t result)> writeFile_cb;

    /**
     * File close callback
     *
     * @param result is file close result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is closed.
     */
    typedef std::function<void(ssize_t result)> closeFile_cb;

    /**
     * Get stat callback
     *
     * @param stat is gotten stat
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

     * @param result is get stat result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result of getting stat.
     */
    typedef std::function<void(ioStat stat, ssize_t result)> stat_cb;

    /**
     * Directory open callback
     *
     * @param result is directory open result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened directory.
     */
    typedef std::function<void(ssize_t result)> openDir_cb;

    struct openFile_data {
        openFile_cb callback;
        ioHandle* fileReq;
    };

    struct readFile_data {
        readFile_cb callback;
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

    struct readFileBuffer_data {
        readFileBuffer_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
    };

    struct writeFile_data {
        writeFile_cb callback;
        ioHandle* fileReq;
        uv_buf_t uvBuff;
        ssize_t result;
    };

    struct closeFile_data {
        closeFile_cb callback;
        ioHandle* fileReq;
    };

    struct stat_data {
        stat_cb callback;
        ioHandle* req;
    };

    /**
     * Init and run main asynchronous loop.
     * Must be called before asynchronous method calls.
     */
    uv_loop_t* initAndRunLoop();

    /**
     * Init and run auxiliary asynchronous loop.
     *
     * @param ploop_exitHandle is pointer to exit handle for deinitialize auxiliary asynchronous loop
     * @return handle of auxiliary asynchronous loop
     */
    uv_loop_t* initAndRunAuxLoop(uv_async_t** ploop_exitHandle);

    /**
     * Get handle of main asynchronous loop
     */
    inline uv_loop_t* getMainLoop() { return asyncLoop; };

    /**
     * Deinitialize main asynchronous loop.
     * Must be called after asynchronous method calls.
     */
    void deinitLoop();

    /**
     * Deinitialize auxiliary asynchronous loop.
     * Must be called after asynchronous method calls in auxiliary asynchronous loop.
     *
     * @param loop is handle of auxiliary asynchronous loop
     * @param loop_exitHandle is exit handle for deinitialize auxiliary asynchronous loop
     */
    void deinitAuxLoop(uv_loop_t* loop, uv_async_t* loop_exitHandle);

    /**
     * Check result for error
     *
     * @param result from asynchronous callback
     * @return true - if an error occurred
     *         false - if the result is successful
     */
    bool isError(ssize_t result);

    /**
     * Get error description by result.
     * isError(result) must be returned true.
     *
     * @param code is result from asynchronous callback
     * @return error description
     */
    const char* getError(ssize_t code);

    /**
     * Check whether the entry is a file
     *
     * @param entry is directory entry (@see IOHandle::next)
     * @return true - if the entry is a file,
     *         false - if otherwise
     */
    bool isFile(const ioDirEntry& entry);

    /**
     * Check whether the entry is a directory
     *
     * @param entry is directory entry (@see IOHandle::next)
     * @return true - if the entry is a directory,
     *         false - if otherwise
     */
    bool isDir(const ioDirEntry& entry);

    /**
     * Class for asynchronous work with files.
     */
    class IOHandle {
    public:
        IOHandle();
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
         * @param callback caused when opening a file or error
         */
        void open(const char* path, int flags, int mode, openFile_cb callback);

        /**
         * Asynchronous read file.
         *
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @param callback caused when reading a file or error
         */
        void read(size_t maxBytesToRead, readFile_cb callback);

        /**
         * Asynchronous read file to initialized buffer.
         *
         * @param buffer is initialized buffer for read from file, buffer size must be at least maxBytesToRead
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @param callback caused when reading a file or error
         */
        void read(void* buffer, size_t maxBytesToRead, readFileBuffer_cb callback);

        /**
         * Asynchronous write file.
         *
         * @param data is byte vector for data written to file
         * @param callback caused when writing a file or error
         */
        void write(const byte_vector& data, writeFile_cb callback);

        /**
         * Asynchronous write file from buffer.
         *
         * @param buffer contains data written to file
         * @param size of buffer in bytes
         * @param callback caused when writing a file or error
         */
        void write(void* buffer, size_t size, writeFile_cb callback);

        /**
         * Asynchronous close file.
         *
         * @param callback caused when closing a file or error
         */
        void close(closeFile_cb callback);

        /**
         * Asynchronous opening of a file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open file
         * @param flags (@see IOHandle::open(const char* path, int flags, int mode, openFile_cb callback))
         * @param mode - specifies the file mode bits be applied when a new file is created
         *              (@see IOHandle::open(const char* path, int flags, int mode, openFile_cb callback))
         * @return pointer to open file handle
         */
        IOHandle* open(const char* path, int flags, int mode);

        /**
         * Asynchronous read file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(readFile_cb callback).
         *
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @return pointer to open file handle
         */
        IOHandle* read(size_t maxBytesToRead);

        /**
         * Asynchronous write file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param data is byte vector for data written to file
         * @return pointer to open file handle
         */
        IOHandle* write(const byte_vector& data);

        /**
         * Asynchronous close file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @return pointer to open file handle
         */
        IOHandle* close();

        /**
         * Callback initialization for asynchronous opening, writing and closing file and open directory for scan.
         * Used when the callback has not been initialized in methods IOHandle::open, IOHandle::write, IOHandle::close
         * and IOHandle::openDir.
         * @see IOHandle::open(const char* path, int flags, int mode)
         * @see IOHandle::write(const byte_vector& data)
         * @see IOHandle::close()
         * @see IOHandle::openDir(const char* path)
         *
         * @param callback is initialized callback for asynchronous opening, writing and closing file or scan directory
         * @return pointer to open file handle
         */
        IOHandle* then(openFile_cb callback);

        /**
         * Callback initialization for asynchronous reading file.
         * Used when the callback has not been initialized in method IOHandle::read.
         * @see IOHandle::read(size_t maxBytesToRead)
         *
         * @param callback is initialized callback for asynchronous reading file
         * @return pointer to open file handle
         */
        IOHandle* then(readFile_cb callback);

        /**
         * Asynchronous open directory for scan.
         *
         * @param path to open directory
         * @param callback caused when opening a directory or error
         */
        void openDir(const char* path, openDir_cb callback);

        /**
         * Get next entry for scan directory.
         *
         * Directory entry is struct with fields:
         *      name - is name of file or directory
         *      type - is type of directory entry
         * For check entry is file use isFile(entry).
         * @see isFile(const ioDirEntry& entry).
         * For check entry is directory use isDir(entry).
         * @see isDir(const ioDirEntry& entry).
         *
         * @param entry is pointer to next directory entry
         * @return true - if a entry is successfully get
         *         false - if can`t get a entry (reached the end of the directory)
         */
        bool next(ioDirEntry *entry);

        /**
         * Asynchronous open directory for scan with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open directory
         * @return pointer to open file handle
         */
        IOHandle* openDir(const char* path);

    private:
        uv_fs_t* ioReq;
        bool closed = false;
        ioHandle_t type;

        std::packaged_task<void(openFile_cb)> task;
        std::packaged_task<void(readFile_cb)> readTask;

        bool initRequest();
        void freeRequest();

        static void open_cb(asyncio::ioHandle *req);
        static void read_cb(asyncio::ioHandle *req);
        static void write_cb(asyncio::ioHandle *req);
        static void close_cb(asyncio::ioHandle *req);
        static void readBuffer_cb(asyncio::ioHandle *req);
    };

    /**
     * File open callback for method asyncio::file::open
     *
     * @param handle is shared pointer to open file handle
     * @param result is file open result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(std::shared_ptr<IOHandle> handle, ssize_t result)> openIOHandle_cb;

    /**
     * File remove callback
     *
     * @param result is file remove result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is removed.
     */
    typedef std::function<void(ssize_t result)> removeFile_cb;

    class file {
    public:
        /**
         * Max size of file for readFile and writeFile
         */
        static const unsigned int MAX_FILE_SIZE = 10485760;

        /**
         * Asynchronous opening of a file with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param flags (@see IOHandle::open)
         * @param mode - specifies the file mode bits be applied when a new file is created (@see IOHandle::open)
         * @param callback caused when opening a file or error
         */
        static void open(const char* path, int flags, int mode, openIOHandle_cb callback);

        /**
         * Asynchronous opening of a file for reading with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param callback caused when opening a file or error
         */
        static void openRead(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronous opening of a file for writing with a callback that returns a shared pointer
         * to an instance of the IOHandle corresponding to the open file.
         *
         * @param path to open file
         * @param callback caused when opening a file or error
         */
        static void openWrite(const char* path, openIOHandle_cb callback);

        /**
         * Asynchronous open and read the entire contents of the file.
         *
         * @param path to open file
         * @param callback when the file is read or an error occurs
         */
        static void readFile(const char* path, readFile_cb callback);

        /**
         * Asynchronous open and read the part of the file.
         *
         * @param path to open file
         * @param pos is starting position in the file for reading
         * @param maxBytesToRead is maximum number of bytes to read from file
         * @param callback when the part of the file is read or an error occurs
         * @param timeout for read file in milliseconds. If the timeout is reached, the file reading is terminated
         *        and the read data in the callback is returned (default 0 - without timeout)
         * @param blockSize is size of block for reading. If the timeout is reached, only read blocks are returned.
         *        If timeout is 0 - parameter is ignored. Default - 8192 bytes.
         */
        static void readFilePart(const char* path, size_t pos, size_t maxBytesToRead, readFile_cb callback,
                unsigned int timeout = 0, size_t blockSize = 8192);

        /**
         * Asynchronous open and write the file.
         *
         * @param path to open file
         * @param data is byte vector for data written to file
         * @param callback when the file is wrote or an error occurs
         */
        static void writeFile(const char* path, const byte_vector& data, writeFile_cb callback);

        /**
         * Asynchronous get stat of a file or directory.
         *
         * @param path to file or directory
         * @param callback caused when getting stat or error
         */
        static void stat(const char* path, stat_cb callback);

        /**
         * Asynchronous opening of a file with callback initialization in the method IOHandle::then.
         * @see IOHandle::then(openFile_cb callback).
         *
         * @param path to open file
         * @param flags (@see IOHandle::open)
         * @param mode - specifies the file mode bits be applied when a new file is created (@see IOHandle::open)
         * @return pointer to open file handle
         */
        static IOHandle* open(const char* path, int flags, int mode);

        /**
         * Asynchronous remove file.
         *
         * @param path to removed file
         * @param callback when the file is removed or an error occurs
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
     * Directory create callback
     *
     * @param result is directory create result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is created.
     */
    typedef std::function<void(ssize_t result)> createDir_cb;

    /**
     * Directory remove callback
     *
     * @param result is directory remove result
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - directory is removed.
     */
    typedef std::function<void(ssize_t result)> removeDir_cb;

    class dir {
    public:
        /**
         * Asynchronous create directory.
         *
         * @param path to created directory
         * @param mode - specifies the directory mode bits be applied when a new directory is created (@see IOHandle::open)
         * @param callback when the directory is created or an error occurs
         */
        static void createDir(const char* path, int mode, createDir_cb callback);

        /**
         * Asynchronous remove directory.
         *
         * @param path to removed directory
         * @param callback when the directory is removed or an error occurs
         */
        static void removeDir(const char* path, removeDir_cb callback);

        /**
         * Asynchronous get stat of a file or directory.
         *
         * @param path to file or directory
         * @param callback caused when getting stat or error
         */
        static void stat(const char* path, stat_cb callback);

    private:
        static void dir_onCreateOrRemove(asyncio::ioHandle *req);
    };
};

#endif //U8_ASYNCIO_H
