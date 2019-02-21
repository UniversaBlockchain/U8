//
// Created by Tairov Dmitriy on 10.02.19.
//

#ifndef U8_IOFILE_H
#define U8_IOFILE_H

#include "AsyncIO.h"
#include "IOHandle.h"
#include "IOHandleThen.h"

namespace asyncio {

    class IOFile;

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
     * File open callback for methods IOFile::open, IOFile::openRead and IOFile::openWrite.
     * @see IOFile::open(const char* path, int flags, int mode, openIOFile_cb callback)
     * @see IOFile::openRead(const char* path, openIOFile_cb callback)
     * @see IOFile::openWrite(const char* path, openIOFile_cb callback)
     *
     * @param handle is shared pointer to open file handle.
     * @param result is file open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(std::shared_ptr<IOFile> handle, ssize_t result)> openIOFile_cb;

    /**
     * File remove callback.
     *
     * @param result is file remove result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - file is removed.
     */
    typedef std::function<void(ssize_t result)> removeFile_cb;

    /**
     * File open callback.
     *
     * @param result is file open result.
     * If isError(result) returns true - use getError(result) to determine the error.
     * If isError(result) returns false - result is handle of opened file.
     */
    typedef std::function<void(ssize_t result)> openFile_cb;

    struct openFile_data {
        openFile_cb callback;
        ioHandle* fileReq;
    };

    struct stat_data {
        stat_cb callback;
        ioHandle* req;
    };

    /**
     * Asynchronous file.
     */
    class IOFile : public IOHandleThen {
    public:
        IOFile(ioLoop* loop = asyncLoop);
        ~IOFile();

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
        void open(const char *path, int flags, int mode, openFile_cb callback);

        /**
         * Asynchronous read file.
         *
         * @param maxBytesToRead is maximum number of bytes to read from file.
         * @param callback caused when reading a file or error.
         */
        void read(size_t maxBytesToRead, read_cb callback);

        /**
         * Asynchronous read file to initialized buffer.
         *
         * @param buffer is initialized buffer for read from file, buffer size must be at least maxBytesToRead.
         * @param maxBytesToRead is maximum number of bytes to read from file.
         * @param callback caused when reading a file or error.
         */
        void read(void *buffer, size_t maxBytesToRead, readBuffer_cb callback);

        /**
         * Asynchronous write file.
         *
         * @param data is byte vector for data written to file.
         * @param callback caused when writing a file or error.
         */
        void write(const byte_vector &data, write_cb callback);

        /**
         * Asynchronous write file from buffer.
         *
         * @param buffer contains data written to file.
         * @param size of buffer in bytes.
         * @param callback caused when writing a file or error.
         */
        void write(void *buffer, size_t size, write_cb callback);

        /**
         * Asynchronous close file.
         *
         * @param callback caused when closing a file or error.
         */
        void close(close_cb callback);

        /**
         * Asynchronous opening of a file with callback initialization in the method IOHandleThen::then.
         * @see IOHandleThen::then(result_cb callback).
         *
         * @param path to open file.
         * @param flags (@see IOFile::open(const char* path, int flags, int mode, openFile_cb callback)).
         * @param mode - specifies the file mode bits be applied when a new file is created
         *              (@see IOFile::open(const char* path, int flags, int mode, openFile_cb callback)).
         * @return pointer to file handle.
         */
        IOFile *prepareOpen(const char *path, int flags, int mode);

        /**
         * Max size of file for readFile and writeFile.
         */
        static const unsigned int MAX_FILE_SIZE = 10485760;

        /**
         * Asynchronous opening of a file with a callback that returns a shared pointer
         * to an instance of the IOFile corresponding to the open file.
         *
         * @param path to open file.
         * @param flags (@see IOFile::open).
         * @param mode - specifies the file mode bits be applied when a new file is created (@see IOFile::open).
         * @param callback caused when opening a file or error.
         */
        static void open(const char* path, int flags, int mode, openIOFile_cb callback);

        /**
         * Asynchronous opening of a file for reading with a callback that returns a shared pointer
         * to an instance of the IOFile corresponding to the open file.
         *
         * @param path to open file.
         * @param callback caused when opening a file or error.
         */
        static void openRead(const char* path, openIOFile_cb callback);

        /**
         * Asynchronous opening of a file for writing with a callback that returns a shared pointer
         * to an instance of the IOFile corresponding to the open file.
         *
         * @param path to open file.
         * @param callback caused when opening a file or error.
         */
        static void openWrite(const char* path, openIOFile_cb callback);

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
         * Asynchronous remove file.
         *
         * @param path to removed file.
         * @param callback when the file is removed or an error occurs.
         */
        static void remove(const char* path, removeFile_cb callback);

    private:
        ioLoop* loop;
        uv_fs_t* ioReq;

        std::atomic<bool> closed = false;

        bool initRequest();

        void freeRequest();

        static void _open_cb(asyncio::ioHandle *req);
        static void _read_cb(asyncio::ioHandle *req);
        static void _write_cb(asyncio::ioHandle *req);
        static void _close_cb(asyncio::ioHandle *req);
        static void _readBuffer_cb(asyncio::ioHandle *req);

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
}

#endif //U8_IOFILE_H
