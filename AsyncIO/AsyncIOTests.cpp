//
// Created by Tairov Dmitriy on 18.01.19.
//

#include <thread>
#include <cstring>

#include "AsyncIO.h"
#include "IOFile.h"
#include "IODir.h"
#include "IOUDP.h"
#include "IOTCP.h"
#include "IOTLS.h"
#include "AsyncIOTests.h"
#include "../tools/AutoThreadPool.h"

using namespace std;

#define NUM_THREADS     5
#define BUFF_SIZE       4096
#define NUM_ITERATIONS  10
#define NUM_BLOCKS      256

#define PORT            10000

typedef unsigned long ulong;
std::shared_ptr<asyncio::IOFile> file[NUM_THREADS];
asyncio::byte_vector dataBuf[NUM_THREADS];
uv_sem_t stop[NUM_THREADS];
size_t fileSize[NUM_THREADS];
int summ[NUM_THREADS];
int block[NUM_THREADS];

#define ASSERT(expr)                                      \
 do {                                                     \
  if (!(expr)) {                                          \
    fprintf(stderr,                                       \
            "Assertion failed in %s on line %d: %s\n",    \
            __FILE__,                                     \
            __LINE__,                                     \
            #expr);                                       \
    abort();                                              \
  }                                                       \
 } while (0)


void allAsyncIOTests() {
    //asyncio::initAndRunLoop(); - already init in main()

    testAsyncFile();
    testAsyncUDP();
    testAsyncTCP();
    testUnifyFileAndTCPread();
    testClientWriteWithouthRead();
    testAsyncTLS();
    stressTestTCP();

    asyncio::deinitLoop();
}

void testAsyncFile() {
    printf("testAsyncFile()...\n");

    vector<thread> ths;

    printf("Write test...\n");

    double fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;

        //Init test buffer
        if (!dataBuf[t].size()) {
            dataBuf[t].reserve(BUFF_SIZE);
            for (uint i = 0; i < BUFF_SIZE; i++)
                dataBuf[t].push_back((uint8_t) i & 0xFF);
        }

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);
                block[t] = 0;

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                file[t] = std::make_shared<asyncio::IOFile>();

                asyncio::write_cb onWrite = [t, &onWrite](ssize_t result) {
                    ASSERT(result == 4096);
                    fileSize[t] += result;

                    if (++block[t] < NUM_BLOCKS)
                        file[t]->write(dataBuf[t], onWrite);
                    else
                        file[t]->close([t](ssize_t result) {
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                };

                file[t]->open(fileName, O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, [t, onWrite](ssize_t result) {
                    ASSERT(!asyncio::isError(result));

                    printf("Open file for writing in thread %ld\n", t + 1);
                    file[t]->write(dataBuf[t], onWrite);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    size_t all = 0;
    for (int t = 0; t < NUM_THREADS; t++) {
        ths[t].join();
        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);

        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    double fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of writing %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Buffer write test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    //Init test buffer
    void *buff = malloc(BUFF_SIZE);
    for (uint i = 0; i < BUFF_SIZE; i++)
        ((char*) buff)[i] = (char) i & 0xFF;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;

        ths.emplace_back([t, buff](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);
                block[t] = 0;

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                file[t] = std::make_shared<asyncio::IOFile>();

                asyncio::write_cb onWrite = [t, &onWrite, buff](ssize_t result) {
                    ASSERT(result == 4096);
                    fileSize[t] += result;

                    if (++block[t] < NUM_BLOCKS)
                        file[t]->write(buff, BUFF_SIZE, onWrite);
                    else
                        file[t]->close([t](ssize_t result) {
                            ASSERT(!asyncio::isError(result));
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                };

                file[t]->open(fileName, O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, [t, onWrite, buff](ssize_t result) {
                    printf("Open file for writing in thread %ld\n", t + 1);

                    ASSERT(!asyncio::isError(result));
                    file[t]->write(buff, BUFF_SIZE, onWrite);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (int t = 0; t < NUM_THREADS; t++) {
        ths[t].join();
        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);
        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of buffer writing %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Read test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;
        summ[t] = 0;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                asyncio::read_cb onRead = [t, &onRead](const asyncio::byte_vector& data, ssize_t result) {
                    ASSERT(!asyncio::isError(result));
                    if (result == 0)
                        file[t]->close([t](ssize_t result) {
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                    else {
                        char* buf = (char*) data.data();
                        for (int n = 0; n < result; n++)
                            summ[t] += buf[n];
                        fileSize[t] += result;

                        file[t]->read(BUFF_SIZE, onRead);
                    }
                };

                file[t]->open(fileName, O_RDONLY, 0, [t, onRead](ssize_t result) {
                    printf("Open file in thread %ld\n", t + 1);
                    ASSERT(!asyncio::isError(result));
                    file[t]->read(BUFF_SIZE, onRead);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (long t = 0; t < NUM_THREADS; t++) {
        ths[t].join();
        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);
        ASSERT(summ[t] == -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2);
        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of reading %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Buffer read test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;
        summ[t] = 0;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                void* buffer = malloc(BUFF_SIZE);

                asyncio::readBuffer_cb onRead = [&](ssize_t result) {
                    ASSERT(!asyncio::isError(result));
                    if (result == 0)
                        file[t]->close([=](ssize_t result) {
                            free(buffer);
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                    else {
                        for (int n = 0; n < result; n++)
                            summ[t] += ((char*) buffer)[n];
                        fileSize[t] += result;

                        file[t]->read(buffer, BUFF_SIZE, onRead);
                    }
                };

                file[t]->open(fileName, O_RDONLY, 0, [=](ssize_t result) {
                    printf("Open file in thread %ld\n", t + 1);
                    ASSERT(!asyncio::isError(result));
                    file[t]->read(buffer, BUFF_SIZE, onRead);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (long t = 0; t < NUM_THREADS; t++) {
        ths[t].join();

        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);
        ASSERT(summ[t] == -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2);

        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of buffer reading %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Write test with async::file::openWrite...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);
                block[t] = 0;

                char fileName[21];
                snprintf(fileName, 21, "TestOpenWrite%ld.bin", t);

                asyncio::write_cb onWrite = [t, &onWrite](ssize_t result) {
                    ASSERT(result == 4096);
                    fileSize[t] += result;

                    if (++block[t] < NUM_BLOCKS)
                        file[t]->write(dataBuf[t], onWrite);
                    else
                        file[t]->close([t](ssize_t result) {
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                };

                asyncio::IOFile::openWrite(fileName, [t, onWrite](std::shared_ptr<asyncio::IOFile> handle, ssize_t result) {
                    printf("Open file for writing in thread %ld\n", t + 1);
                    ASSERT(!asyncio::isError(result));
                    file[t] = handle;
                    file[t]->write(dataBuf[t], onWrite);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (int t = 0; t < NUM_THREADS; t++) {
        ths[t].join();

        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);

        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of writing (open with async::file::openWrite) %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Read test with async::file::openRead...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    for (long t = 0; t < NUM_THREADS; t++) {
        fileSize[t] = 0;
        summ[t] = 0;

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                asyncio::read_cb onRead = [t, &onRead](const asyncio::byte_vector& data, ssize_t result) {
                    ASSERT(!asyncio::isError(result));
                    if (result == 0)
                        file[t]->close([t](ssize_t result) {
                            uv_sem_post(&stop[t]);
                            printf("Close file in thread: %ld\n", t + 1);
                        });
                    else {
                        char* buf = (char*) data.data();
                        for (int n = 0; n < result; n++)
                            summ[t] += buf[n];
                        fileSize[t] += result;

                        file[t]->read(BUFF_SIZE, onRead);
                    }
                };

                asyncio::IOFile::openRead(fileName, [t, onRead](std::shared_ptr<asyncio::IOFile> handle, ssize_t result) {
                    printf("Open file in thread %ld\n", t + 1);
                    ASSERT(!asyncio::isError(result));
                    file[t] = handle;
                    file[t]->read(BUFF_SIZE, onRead);
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);
            }
        });
    }

    printf("Threads started\n");

    all = 0;
    for (long t = 0; t < NUM_THREADS; t++) {
        ths[t].join();

        ASSERT(fileSize[t] == BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS);
        ASSERT(summ[t] == -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2);

        all += fileSize[t];
    }

    printf("Threads completed\n");

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of reading (open with async::file::openRead) %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Reading the entire files test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[16];
        snprintf(fileName, 16, "TestFile%i.bin", t);

        for (int i = 0; i < NUM_ITERATIONS; i++)
            asyncio::IOFile::readFile(fileName, [](const asyncio::byte_vector& data, ssize_t result) {
                printf("Read file. Size = %i. Result = %i\n", (int) data.size(), (int) result);
                ASSERT(!asyncio::isError(result));

                long sum = 0;
                ulong size = data.size();
                char* buf = (char*) data.data();
                for (int n = 0; n < size; n++)
                    sum += buf[n];

                ASSERT(sum == -BUFF_SIZE * NUM_BLOCKS / 2);

                uv_sem_post(&stop[0]);
            });
    }

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    all = NUM_THREADS * NUM_ITERATIONS * NUM_BLOCKS * BUFF_SIZE;
    printf("Time of reading (by asyncio::file::readFile) %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

    printf("Writing the entire files test...\n");

    fTimeStart = clock() / (double)CLOCKS_PER_SEC;

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[22];
        snprintf(fileName, 22, "TestEntireFile%i.bin", t);

        asyncio::IOFile::writeFile(fileName, dataBuf[t], [](ssize_t result) {
            printf("Wrote file. Result = %i\n", (int) result);
            ASSERT(!asyncio::isError(result));

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    all = NUM_THREADS * BUFF_SIZE;
    printf("Time of writing (by asyncio::file::writeFile) %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS, fTimeStop - fTimeStart, all);

    printf("Reading the part of file test...\n");

    uv_sem_init(&stop[0], 0);

    asyncio::IOFile::readFilePart("TestEntireFile0.bin", 10, 10, [](const asyncio::byte_vector& data, ssize_t result) {
        printf("Read the part of file. Size = %i. Result = %i\n", (int) data.size(), (int) result);

        long sum = 0;
        ulong size = data.size();
        char* buf = (char*) data.data();
        for (int n = 0; n < size; n++)
            sum += buf[n];

        ASSERT(sum == (10 + 19) * 5);

        uv_sem_post(&stop[0]);
    });

    asyncio::IOFile::readFilePart("TestFile0.bin", BUFF_SIZE * NUM_BLOCKS - 256, 500, [](const asyncio::byte_vector& data, ssize_t result) {
        printf("Read the part of file. Size = %i. Result = %i\n", (int) data.size(), (int) result);

        long sum = 0;
        ulong size = data.size();
        char* buf = (char*) data.data();
        for (int n = 0; n < size; n++)
            sum += buf[n];

        ASSERT(size == 256);
        ASSERT(sum == -128);

        uv_sem_post(&stop[0]);
    });

    uv_sem_wait(&stop[0]);
    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Reading the part of file test with timeout...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[16];
        snprintf(fileName, 16, "TestFile%i.bin", t);

        asyncio::IOFile::readFilePart(fileName, 10, BUFF_SIZE * NUM_BLOCKS,
                [](const asyncio::byte_vector& data, ssize_t result) {
            printf("Read the part of file with timeout. Size = %i. Result = %i\n", (int) data.size(), (int) result);
            ASSERT(!asyncio::isError(result));

            long sum = 0;
            ulong size = data.size();
            char* buf = (char*) data.data();
            for (int n = 0; n < size; n++)
                sum += buf[n];

            char x = 10;
            long expected = -128 * (result / 256);
            for (int i = 0; i < result % 256; i++)
                expected += x++;

            ASSERT(sum == expected);

            uv_sem_post(&stop[0]);
        }, 10, (size_t) 8192 / (t + 1));
    }

    for (int t = 0; t < NUM_THREADS; t++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Test auto closing file...\n");

    uv_sem_init(&stop[0], 0);

    auto fc = std::make_shared<asyncio::IOFile>();

    fc->open("TestFile0.bin", O_RDWR, 0, [fc{std::move(fc)}](ssize_t result) mutable {
        ASSERT(!asyncio::isError(result));
        printf("File open\n");

        fc->read(1000, [fc{std::move(fc)}](const asyncio::byte_vector& data, ssize_t result) mutable {
            ASSERT(!asyncio::isError(result));
            printf("Read %ld bytes\n", result);

            fc->write(data, [fc{std::move(fc)}](ssize_t result) mutable {
                runAsync([fc{std::move(fc)},result]() mutable {
                    ASSERT(!asyncio::isError(result));
                    printf("Wrote %ld bytes\n", result);

                    fc.reset();

                    uv_sem_post(&stop[0]);
                });
            });
        });
    });

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    // sleep for auto-closing
    printf("Sleep for auto-closing...");
    nanosleep((const struct timespec[]){{0, 500000000L}}, nullptr);
    printf("done.\n");

    printf("File work test with asyncio::IOHandle::then()...\n");

    uv_sem_init(&stop[0], 0);

    auto f = std::make_shared<asyncio::IOFile>();

    f->prepareOpen("TestFile0.bin", O_RDWR, 0)->then([&](ssize_t result) {
        ASSERT(!asyncio::isError(result));
        printf("File open\n");

        f->prepareRead(100)->then([&](const asyncio::byte_vector& data, ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Read %ld bytes\n", result);

            f->prepareWrite(data)->then([&](ssize_t result) {
                ASSERT(!asyncio::isError(result));
                printf("Wrote %ld bytes\n", result);

                f->prepareClose()->then([&](ssize_t result) {
                    ASSERT(!asyncio::isError(result));
                    printf("File closed\n");

                    uv_sem_post(&stop[0]);
                });
            });
        });
    });

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Scan directory test (and get stat of content)...\n");

    auto dir = std::make_shared<asyncio::IODir>();

    auto dirLambda = [&](ssize_t result) {
        if (!asyncio::isError(result))
            printf("Directory open for scan\n");

        asyncio::ioDirEntry entry;
        while (dir->next(&entry)) {
            std::string type;
            if (asyncio::isFile(entry))
                type = "File";
            else if (asyncio::isDir(entry))
                type = "Directory";
            else
                type = "Other";

            std::string name = entry.name;

            asyncio::IOFile::stat(name.data(), [=](asyncio::ioStat stat, ssize_t result) {
                printf("%s: %s. Size = %lu Mode = %lu\n", type.data(), name.data(),
                        (unsigned long) stat.st_size, (unsigned long) stat.st_mode);
            });
        }

        uv_sem_post(&stop[0]);
    };

    // check 2 types syntax
    uv_sem_init(&stop[0], 0);

    dir->open(".", dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    auto dirThen = std::make_shared<asyncio::IODir>();

    uv_sem_init(&stop[0], 0);

    dirThen->prepareOpen(".")->then(dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Remove files test...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[22];
        snprintf(fileName, 22, "TestFile%i.bin", t);

        asyncio::IOFile::remove(fileName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestEntireFile%i.bin", t);

        asyncio::IOFile::remove(fileName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestOpenWrite%i.bin", t);

        asyncio::IOFile::remove(fileName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS * 3; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Create directories test...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char dirName[12];
        snprintf(dirName, 12, "TestDir%i", t);

        asyncio::IODir::createDir(dirName, S_IRWXU | S_IRWXG | S_IRWXO, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Directory %s created.\n", dirName);

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Remove directories test...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char dirName[12];
        snprintf(dirName, 12, "TestDir%i", t);

        asyncio::IODir::removeDir(dirName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Directory %s removed.\n", dirName);

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    free(buff);

    printf("testAsyncFile()...done\n\n");
}

void testAsyncUDP() {
    printf("testAsyncUDP()...\n");

    vector<thread> ths;

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOUDP srv;
                asyncio::IOUDP cli;

                uv_sem_init(&stop[t], 0);

                srv.open("127.0.0.1", PORT + (unsigned int)t);

                srv.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port){
                    ASSERT(result == 5);
                    ASSERT(!memcmp("PING", data.data(), 4));

                    printf("Server received: PING\n");

                    srv.stopRecv();

                    asyncio::byte_vector pong(5);
                    memcpy(pong.data(), "PONG", 4);

                    srv.send(pong, IP, port, [&](ssize_t result){
                        ASSERT(result == 5);

                        srv.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                cli.open("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                asyncio::byte_vector ping(5);
                memcpy(ping.data(), "PING", 4);

                cli.send(ping, "127.0.0.1", PORT + (unsigned int)t, [&](ssize_t result){
                    ASSERT(result == 5);

                    cli.recv([&](ssize_t result, const asyncio::byte_vector& data, const char* IP, unsigned int port){
                        ASSERT(result == 5);
                        ASSERT(!memcmp("PONG", data.data(), 4));

                        printf("Client received: PONG\n");

                        cli.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            };
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test with byte-vectors successful\n");

    ths.clear();

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOUDP srv;
                asyncio::IOUDP cli;

                uv_sem_init(&stop[t], 0);

                srv.open("127.0.0.1", PORT + (unsigned int)t);

                char buffer_srv[5];

                srv.recv(buffer_srv, 5, [&](ssize_t result, const char* IP, unsigned int port){
                    ASSERT(result == 5);
                    ASSERT(!memcmp("PING", buffer_srv, 4));

                    printf("Server received: PING\n");

                    srv.stopRecv();

                    srv.send((void*) "PONG", 5, IP, port, [&](ssize_t result){
                        ASSERT(result == 5);

                        srv.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                char buffer_cli[5];

                cli.open("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                cli.send((void*) "PING", 5, "127.0.0.1", PORT + (unsigned int)t, [&](ssize_t result){
                    ASSERT(result == 5);

                    cli.recv(buffer_cli, 5, [&](ssize_t result, const char* IP, unsigned int port){
                        ASSERT(result == 5);
                        ASSERT(!memcmp("PONG", buffer_cli, 4));

                        printf("Client received: PONG\n");

                        cli.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            };
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test with memory buffers successful\n");

    ths.clear();

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOUDP srv;
                asyncio::IOUDP cli;

                uv_sem_init(&stop[t], 0);

                srv.open("127.0.0.1", PORT + (unsigned int)t);

                srv.setDefaultAddress("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                srv.read(4096, [&](const asyncio::byte_vector& data, ssize_t result){
                    ASSERT(result == 5);
                    ASSERT(!memcmp("PING", data.data(), 4));

                    printf("Server received: PING\n");

                    asyncio::byte_vector pong(5);
                    memcpy(pong.data(), "PONG", 4);

                    srv.write(pong, [&](ssize_t result){
                        ASSERT(result == 5);

                        srv.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                cli.open("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                asyncio::byte_vector ping(5);
                memcpy(ping.data(), "PING", 4);

                cli.setDefaultAddress("127.0.0.1", PORT + (unsigned int)t);

                cli.write(ping, [&](ssize_t result){
                    ASSERT(result == 5);

                    cli.read(4096, [&](const asyncio::byte_vector& data, ssize_t result){
                        ASSERT(result == 5);
                        ASSERT(!memcmp("PONG", data.data(), 4));

                        printf("Client received: PONG\n");

                        cli.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            };
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test read/write with byte-vectors successful\n");

    ths.clear();

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOUDP srv;
                asyncio::IOUDP cli;

                uv_sem_init(&stop[t], 0);

                srv.open("127.0.0.1", PORT + (unsigned int)t);

                srv.setDefaultAddress("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                char buffer_srv[5];

                srv.read(buffer_srv, 5, [&](ssize_t result){
                    ASSERT(result == 5);
                    ASSERT(!memcmp("PING", buffer_srv, 4));

                    printf("Server received: PING\n");

                    srv.write((void*) "PONG", 5, [&](ssize_t result){
                        ASSERT(result == 5);

                        srv.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                char buffer_cli[5];

                cli.open("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

                cli.setDefaultAddress("127.0.0.1", PORT + (unsigned int)t);

                cli.write((void*) "PING", 5, [&](ssize_t result){
                    ASSERT(result == 5);

                    cli.read(buffer_cli, 5, [&](ssize_t result){
                        ASSERT(result == 5);
                        ASSERT(!memcmp("PONG", buffer_cli, 4));

                        printf("Client received: PONG\n");

                        cli.close([t](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&stop[t]);
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            };
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test read/write with memory buffers successful\n");

    printf("testAsyncUDP()...done\n\n");
}

void testAsyncTCP() {
    printf("testAsyncTCP()...\n");

    uv_sem_t sem_tcp_srv;
    uv_sem_init(&sem_tcp_srv, 0);

    uv_mutex_t clients_mutex;
    uv_mutex_init(&clients_mutex);

    //init TCP server
    asyncio::IOTCP srv;
    vector<asyncio::IOTCP*> clients;

    srv.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        uv_mutex_lock(&clients_mutex);

        unsigned long n = clients.size();
        clients.push_back(srv.accept());

        uv_mutex_unlock(&clients_mutex);

        clients[n]->enableKeepAlive(60);

        clients[n]->read(4096, [n, &sem_tcp_srv, &clients](const asyncio::byte_vector& data, ssize_t result){
            ASSERT(result == 5);
            ASSERT(!memcmp("PING", data.data(), 4));

            printf("Server received: PING\n");

            asyncio::byte_vector pong(5);
            memcpy(pong.data(), "PONG", 4);

            clients[n]->write(pong, [n, &sem_tcp_srv, &clients](ssize_t result){
                ASSERT(result == 5);

                clients[n]->close([&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    uv_sem_post(&sem_tcp_srv);
                });
            });
        });
    });

    //TCP client threads
    vector<thread> clientThreads;

    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTCP cli;

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT, [&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    printf("Connected to server\n");

                    cli.enableKeepAlive(60);

                    asyncio::byte_vector ping(5);
                    memcpy(ping.data(), "PING", 4);

                    cli.write(ping, [&](ssize_t result){
                        ASSERT(result == 5);

                        cli.read(4096, [&](const asyncio::byte_vector& data, ssize_t result){
                            ASSERT(result == 5);
                            ASSERT(!memcmp("PONG", data.data(), 4));

                            printf("Client received: PONG\n");

                            cli.close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));
                                uv_sem_post(&stop[t]);
                            });
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);
    uv_mutex_destroy(&clients_mutex);

    //close TCP server
    uv_sem_init(&sem_tcp_srv, 0);

    printf("Close server\n");

    srv.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tcp_srv);
    });

    uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);

    printf("test with byte-vectors successful\n");

    clientThreads.clear();
    clients.clear();

    uv_sem_init(&sem_tcp_srv, 0);
    uv_mutex_init(&clients_mutex);

    //init TCP server
    asyncio::IOTCP srv_buff;
    vector<char*> buffs;

    srv_buff.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        uv_mutex_lock(&clients_mutex);

        unsigned long n = clients.size();
        clients.push_back(srv_buff.accept());

        char* buff = (char*) malloc(5);
        unsigned long b = buffs.size();
        buffs.push_back(buff);

        uv_mutex_unlock(&clients_mutex);

        clients[n]->read(buff, 5, [n, b, &buffs, &sem_tcp_srv, &clients](ssize_t result){
            ASSERT(result == 5);
            ASSERT(!memcmp("PING", buffs[b], 4));

            printf("Server received: PING\n");

            free(buffs[b]);

            clients[n]->write((void*) "PONG", 5, [n, &sem_tcp_srv, &clients](ssize_t result){
                ASSERT(result == 5);

                clients[n]->close([&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    uv_sem_post(&sem_tcp_srv);
                });
            });
        });
    });

    //TCP client threads
    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTCP cli;

                char buff_cli[5];

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT, [&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    printf("Connected to server\n");

                    cli.write((void*) "PING", 5, [&](ssize_t result){
                        ASSERT(result == 5);

                        cli.read(buff_cli, 5, [&](ssize_t result){
                            ASSERT(result == 5);
                            ASSERT(!memcmp("PONG", buff_cli, 4));

                            printf("Client received: PONG\n");

                            cli.close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));
                                uv_sem_post(&stop[t]);
                            });
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);
    uv_mutex_destroy(&clients_mutex);

    //close TCP server
    uv_sem_init(&sem_tcp_srv, 0);

    printf("Close server\n");

    srv_buff.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tcp_srv);
    });

    uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);

    printf("test with memory buffers successful\n");

    clientThreads.clear();
    clients.clear();

    //init TCP server
    asyncio::IOTCP srv_part;

    uv_sem_init(&sem_tcp_srv, 0);

    srv_part.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        clients.push_back(srv_part.accept());

        clients[0]->read(3, [&](const asyncio::byte_vector& data, ssize_t result){
            ASSERT(result == 3);
            ASSERT(!memcmp("ABC", data.data(), 3));

            printf("Server received: ABC\n");

            clients[0]->read(3, [&](const asyncio::byte_vector& data, ssize_t result){
                ASSERT(result == 3);
                ASSERT(!memcmp("DEF", data.data(), 3));

                printf("Server received: DEF\n");

                clients[0]->read(3, [&](const asyncio::byte_vector& data, ssize_t result){
                    ASSERT(result == 3);
                    ASSERT(!memcmp("GHI", data.data(), 3));

                    printf("Server received: GHI\n");

                    clients[0]->read(3, [&](const asyncio::byte_vector& data, ssize_t result){
                        ASSERT(result == 1);

                        ASSERT(!memcmp("J", data.data(), 1));
                        printf("Server received: J\n");

                        clients[0]->close([&](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&sem_tcp_srv);
                        });
                    });
                });
            });
        });
    });

    //init TCP client
    asyncio::IOTCP cli;

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        cli.write((void*) "ABCDEFGHIJ", 10, [&](ssize_t result){
            ASSERT(result == 10);

            cli.close([&](ssize_t result){
                ASSERT(!asyncio::isError(result));
                uv_sem_post(&sem_tcp_srv);
            });
        });
    });

    uv_sem_wait(&sem_tcp_srv);
    uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);

    asyncio::IOTCP nonexistentClient;

    int result = nonexistentClient.acceptFromListeningSocket(&srv_part);
    printf("Check accept nonexistent client result: %i what: %s\n", result, asyncio::getError(result));

    uv_sem_init(&sem_tcp_srv, 0);

    nonexistentClient.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tcp_srv);
    });

    uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);

    //close TCP server
    uv_sem_init(&sem_tcp_srv, 0);

    printf("Close server\n");

    srv_part.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tcp_srv);
    });

    uv_sem_wait(&sem_tcp_srv);
    uv_sem_destroy(&sem_tcp_srv);

    delete clients[0];
    clients.clear();

    printf("partial read test successful\n");

    printf("testAsyncTCP()...done\n\n");
}

void testUnifyFileAndTCPread() {
    printf("testUnifyFileAndTCPread()...\n");

    uv_sem_t sem;
    uv_sem_init(&sem, 0);

    // FILE
    asyncio::IOFile file;

    file.open("UnifyTest.txt", O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, [&](ssize_t result) {
        ASSERT(!asyncio::isError(result));

        file.write((void*) "ABCDEFGHIJ", 10, [&](ssize_t result){
            ASSERT(result == 10);

            file.close([&](ssize_t result) {
                ASSERT(!asyncio::isError(result));

                uv_sem_post(&sem);
            });
        });
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    char buff[3];

    file.open("UnifyTest.txt", O_RDONLY, 0, [&](ssize_t result) {
        ASSERT(!asyncio::isError(result));

        file.read(buff, 3, [&](ssize_t result){
            ASSERT(result == 3);
            ASSERT(!memcmp("ABC", buff, 3));

            printf("Read from file: ABC\n");

            file.read(buff, 3, [&](ssize_t result){
                ASSERT(result == 3);
                ASSERT(!memcmp("DEF", buff, 3));

                printf("Read from file: DEF\n");

                file.read(buff, 3, [&](ssize_t result){
                    ASSERT(result == 3);
                    ASSERT(!memcmp("GHI", buff, 3));

                    printf("Read from file: GHI\n");

                    file.read(buff, 3, [&](ssize_t result){
                        ASSERT(result == 1);
                        ASSERT(!memcmp("J", buff, 1));

                        printf("Read from file: J\n");

                        file.close([&](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&sem);
                        });
                    });
                });
            });
        });
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    printf("unify file test successful\n");

    // TCP
    asyncio::IOTCP srv;
    asyncio::IOTCP acc;

    uv_sem_init(&sem, 0);

    srv.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        int res = acc.acceptFromListeningSocket(&srv);
        ASSERT(!asyncio::isError(res));

        acc.write((void*) "ABCDEFGHIJ", 10, [&](ssize_t result){
            ASSERT(result == 10);

            acc.close([&](ssize_t result){
                ASSERT(!asyncio::isError(result));

                uv_sem_post(&sem);
            });
        });
    });

    asyncio::IOTCP cli;

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        cli.read(buff, 3, [&](ssize_t result){
            ASSERT(result == 3);
            ASSERT(!memcmp("ABC", buff, 3));

            printf("Client received: ABC\n");

            cli.read(buff, 3, [&](ssize_t result){
                ASSERT(result == 3);
                ASSERT(!memcmp("DEF", buff, 3));

                printf("Client received: DEF\n");

                cli.read(buff, 3, [&](ssize_t result){
                    ASSERT(result == 3);
                    ASSERT(!memcmp("GHI", buff, 3));

                    printf("Client received: GHI\n");

                    cli.read(buff, 3, [&](ssize_t result){
                        ASSERT(result == 1);

                        ASSERT(!memcmp("J", buff, 1));
                        printf("Client received: J\n");

                        cli.close([&](ssize_t result){
                            ASSERT(!asyncio::isError(result));

                            uv_sem_post(&sem);
                        });
                    });
                });
            });
        });
    });

    uv_sem_wait(&sem);
    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    //close TCP server
    uv_sem_init(&sem, 0);

    printf("Close server\n");

    srv.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem);
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    printf("unify TCP test successful\n");

    printf("testUnifyFileAndTCPread()...done\n\n");
}

void testClientWriteWithouthRead() {
    printf("testClientWriteWithouthRead()...\n");

    uv_sem_t sem;

    asyncio::IOTCP srv;
    asyncio::IOTCP acc;

    uv_sem_init(&sem, 0);

    srv.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        int res = acc.acceptFromListeningSocket(&srv);
        ASSERT(!asyncio::isError(res));

        acc.write((void*) "ABCDEFGH", 8, [&](ssize_t result){
            ASSERT(result == 8);
        });
    });

    char buff[2048];

    asyncio::IOTCP cli;

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        cli.write((void*) "foobar\n", 8, [&](ssize_t result){
            ASSERT(result == 8);

            cli.read(buff, 2048, [&](ssize_t result){
                ASSERT(result == 8);
                ASSERT(!memcmp("ABCDEFGH", buff, 8));

                printf("Server received: ABCDEFGH\n");

                uv_sem_post(&sem);

                cli.read(buff, 2048, [&](ssize_t result){
                    ASSERT(result == 0);

                    printf("Server finished receiving\n");
                });
            });
        });
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    uv_sem_init(&sem, 0);

    std::this_thread::sleep_for(100ms);

    thread th_acc([&](){
        printf("Close accepted socket\n");

        acc.close([&](ssize_t result){
            ASSERT(!asyncio::isError(result));

            uv_sem_post(&sem);
        });
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    uv_sem_init(&sem, 0);

    std::this_thread::sleep_for(100ms);

    thread th_cli([&](){
        printf("Close client socket\n");

        cli.close([&](ssize_t result){
            ASSERT(result == UV_ECONNRESET);

            uv_sem_post(&sem);
        });
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    //close TCP server
    uv_sem_init(&sem, 0);

    printf("Close server\n");

    srv.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem);
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    th_acc.join();
    th_cli.join();

    printf("client write without read test successful\n");

    printf("testClientWriteWithouthRead()...done\n\n");
}

void testAsyncTLS() {
    printf("testAsyncTLS()...\n");

    uv_sem_t sem_tls_srv;
    uv_sem_init(&sem_tls_srv, 0);

    //init TLS server
    asyncio::IOTLS srv;
    vector<asyncio::IOTLS*> clients;

    srv.open("127.0.0.1", PORT, "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        clients.push_back(srv.accept([&](asyncio::IOTLS* handle, ssize_t result){
            printf("Connection accepted\n");

            handle->enableKeepAlive(60);

            handle->read(4096, [handle, &sem_tls_srv](const asyncio::byte_vector& data, ssize_t result){
                ASSERT(result == 5);
                ASSERT(!memcmp("PING", data.data(), 4));

                printf("Server received: PING\n");

                asyncio::byte_vector pong(5);
                memcpy(pong.data(), "PONG", 4);

                handle->write(pong, [handle, &sem_tls_srv](ssize_t result){
                    ASSERT(result == 5);

                    handle->close([&](ssize_t result){
                        ASSERT(!asyncio::isError(result));

                        uv_sem_post(&sem_tls_srv);
                    });
                });
            });
        }));
    });

    //TLS client threads
    vector<thread> clientThreads;

    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTLS cli;
                printf("Connecting to server\n");

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT,
                        "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){

                    ASSERT(!asyncio::isError(result));

                    printf("Connected to server\n");

                    cli.enableKeepAlive(60);

                    asyncio::byte_vector ping(5);
                    memcpy(ping.data(), "PING", 4);

                    cli.write(ping, [&](ssize_t result){
                        ASSERT(result == 5);

                        cli.read(4096, [&](const asyncio::byte_vector& data, ssize_t result){
                            ASSERT(result == 5);
                            ASSERT(!memcmp("PONG", data.data(), 4));

                            printf("Client received: PONG\n");

                            cli.close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));
                                uv_sem_post(&stop[t]);
                            });
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    for (asyncio::IOTLS* handle : clients)
        delete handle;

    //close TLS server
    uv_sem_init(&sem_tls_srv, 0);

    printf("Close server\n");

    srv.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tls_srv);
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    clientThreads.clear();
    clients.clear();

    printf("test with byte-vectors successful\n");

    uv_sem_init(&sem_tls_srv, 0);

    //init TLS server
    asyncio::IOTLS srv_buff;

    srv_buff.open("127.0.0.1", PORT, "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        clients.push_back(srv_buff.accept([&](asyncio::IOTLS* handle, ssize_t result) {
            printf("Connection accepted\n");

            char* buff = (char*) malloc(5);

            handle->read(buff, 5, [&, buff, handle](ssize_t result){
                ASSERT(result == 5);
                ASSERT(!memcmp("PING", buff, 4));

                printf("Server received: PING\n");

                free(buff);

                handle->write((void*) "PONG", 5, [&, handle](ssize_t result){
                    ASSERT(result == 5);

                    handle->close([&](ssize_t result){
                        ASSERT(!asyncio::isError(result));

                        uv_sem_post(&sem_tls_srv);
                    });
                });
            });
        }));
    });

    //TLS client threads
    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTLS cli;

                char buff_cli[5];

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT,
                        "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    printf("Connected to server\n");

                    cli.write((void*) "PING", 5, [&](ssize_t result){
                        ASSERT(result == 5);

                        cli.read(buff_cli, 5, [&](ssize_t result){
                            ASSERT(result == 5);
                            ASSERT(!memcmp("PONG", buff_cli, 4));

                            printf("Client received: PONG\n");

                            cli.close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));
                                uv_sem_post(&stop[t]);
                            });
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    for (asyncio::IOTLS* handle : clients)
        delete handle;

    //close TLS server
    uv_sem_init(&sem_tls_srv, 0);

    printf("Close server\n");

    srv_buff.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tls_srv);
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    clientThreads.clear();
    clients.clear();

    printf("test with memory buffers successful\n");

    //init TLS server
    asyncio::IOTLS srv_part;

    uv_sem_init(&sem_tls_srv, 0);

    srv_part.open("127.0.0.1", PORT, "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        clients.push_back(srv_part.accept([&](asyncio::IOTLS* handle, ssize_t result) {
            printf("Connection accepted\n");

            handle->read(3, [&, handle](const asyncio::byte_vector& data, ssize_t result){
                ASSERT(result == 3);
                ASSERT(!memcmp("ABC", data.data(), 3));

                printf("Server received: ABC\n");

                handle->read(3, [&, handle](const asyncio::byte_vector& data, ssize_t result){
                    ASSERT(result == 3);
                    ASSERT(!memcmp("DEF", data.data(), 3));

                    printf("Server received: DEF\n");

                    handle->read(3, [&, handle](const asyncio::byte_vector& data, ssize_t result){
                        ASSERT(result == 3);
                        ASSERT(!memcmp("GHI", data.data(), 3));

                        printf("Server received: GHI\n");

                        handle->read(3, [&, handle](const asyncio::byte_vector& data, ssize_t result){
                            ASSERT(result == 1);

                            ASSERT(!memcmp("J", data.data(), 1));
                            printf("Server received: J\n");

                            handle->close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));

                                uv_sem_post(&sem_tls_srv);
                            });
                        });
                    });
                });
            });
        }));
    });

    //init TLS client
    asyncio::IOTLS cli;

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        cli.write((void*) "ABCDEFGHIJ", 10, [&](ssize_t result){
            ASSERT(result == 10);

            cli.close([&](ssize_t result){
                ASSERT(!asyncio::isError(result));
                uv_sem_post(&sem_tls_srv);
            });
        });
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    //close TLS server
    uv_sem_init(&sem_tls_srv, 0);

    printf("Close server\n");

    srv_part.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tls_srv);
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    delete clients[0];
    clients.clear();

    printf("partial read test successful\n");

    uv_sem_init(&sem_tls_srv, 0);

    //init TLS server
    asyncio::IOTLS srv_tls;

    srv_tls.open("127.0.0.1", PORT, "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        clients.push_back(srv_tls.accept([&](asyncio::IOTLS* handle, ssize_t result){
            ASSERT(result == ERR_TLS_ACCEPT_TIMEOUT);
            ASSERT(handle == nullptr);

            printf("No handshake, connection not accepted\n");

            uv_sem_post(&sem_tls_srv);
        }, 50));
    });

    //TCP client threads (TCP not establish TLS handshake)
    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTCP cli;

                char buff_cli[5];

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT, [&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    printf("Connected to server\n");

                    cli.write((void*) "PING", 5, [&](ssize_t result){
                        ASSERT(result == 5);

                        cli.read(buff_cli, 5, [&](ssize_t result){
                            ASSERT(result <= 0);

                            cli.close([&](ssize_t result){
                                ASSERT(!asyncio::isError(result));
                                uv_sem_post(&stop[t]);
                            });
                        });
                    });
                });

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    for (asyncio::IOTLS* handle : clients)
        delete handle;

    //close TLS server
    uv_sem_init(&sem_tls_srv, 0);

    printf("Close server\n");

    srv_tls.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tls_srv);
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    clientThreads.clear();
    clients.clear();

    printf("test closing accepting sockets without TLS handshake successful\n");

    uv_sem_init(&sem_tls_srv, 0);

    //init TCP server (TCP not establish TLS handshake)
    asyncio::IOTCP srv_tcp;
    vector<asyncio::IOTCP*> clients_tcp;

    uv_mutex_t clients_mutex;
    uv_mutex_init(&clients_mutex);

    srv_tcp.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        uv_mutex_lock(&clients_mutex);

        unsigned long n = clients_tcp.size();
        clients_tcp.push_back(srv_tcp.accept());

        uv_mutex_unlock(&clients_mutex);

        clients_tcp[n]->enableKeepAlive(60);

        clients_tcp[n]->read(4096, [&, n](const asyncio::byte_vector& data, ssize_t result){
            asyncio::byte_vector answer(7);
            memcpy(answer.data(), "ANSWER", 6);

            clients_tcp[n]->write(answer, [&, n](ssize_t result){
                ASSERT(result == 7);

                clients_tcp[n]->close([&](ssize_t result){
                    ASSERT(!asyncio::isError(result));

                    uv_sem_post(&sem_tls_srv);
                });
            });
        });
    });

    //TLS client threads
    for (long t = 0; t < NUM_THREADS; t++) {
        clientThreads.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOTLS cli;

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i + 1, "127.0.0.1", PORT,
                            "../test/server-cert.pem", "../test/server-key.pem", [&](ssize_t result){
                    ASSERT(result == ERR_TLS_CONNECT_TIMEOUT);

                    uv_sem_post(&stop[t]);
                }, 50);

                uv_sem_wait(&stop[t]);
                uv_sem_destroy(&stop[t]);

                printf("Thread %ld iteration %i\n", t, i);
            }
        });
    }

    for (long t = 0; t < NUM_THREADS; t++)
        clientThreads[t].join();

    for (int i = 0; i < NUM_THREADS * NUM_ITERATIONS; i++)
        uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);

    for (asyncio::IOTCP* handle : clients_tcp)
        delete handle;

    //close TCP server
    uv_sem_init(&sem_tls_srv, 0);

    printf("Close server\n");

    srv_tcp.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem_tls_srv);
    });

    uv_sem_wait(&sem_tls_srv);
    uv_sem_destroy(&sem_tls_srv);
    uv_mutex_destroy(&clients_mutex);

    clientThreads.clear();
    clients_tcp.clear();

    printf("test closing connecting sockets without TLS handshake successful\n");

    printf("testAsyncTLS()...done\n\n");
}

void stressTestTCP() {
    printf("\nstressTestTCP...\n");

    int blocks = 100;
    int packages = 10000; //packages in block
    const int length_package = 50;

    int counter = 0;
    uv_sem_t sem;

    asyncio::IOTCP srv;
    asyncio::IOTCP acc;

    uv_sem_init(&sem, 0);

    srv.open("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        int res = acc.acceptFromListeningSocket(&srv);
        ASSERT(!asyncio::isError(res));

        for (int i = 0; i < blocks; i++) {
            printf("Send block %i of %i packages\n", i, packages);

            for (int j = 0; j < packages; j++) {
                //printf("repeats package : %i \n", j);

                auto send_buf = (unsigned char*) malloc(length_package);
                for (int x = 0; x < length_package; x++) {
                    send_buf[x] = (unsigned char)(i & 0xFF);
                    //printf("send_buf[x] data =  %i \n", send_buf[x]);
                }

                acc.write(send_buf, length_package, [=](ssize_t result) {
                    ASSERT(!asyncio::isError(result));

                    free(send_buf);
                });
            }
        }
        //printf("Completed sending %i packets, repeats %i \n", count_package, repeats_package);
    });

    unsigned char recv_buf[length_package];

    asyncio::IOTCP cli;

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        for (int i = 0; i < blocks; ++i) {
            for (int j = 0; j < packages; j++) {
                cli.read(recv_buf, length_package, [&, i, j](ssize_t result) {
                    ++counter;
                    //printf("Recv package : %i length_package %i \n", counter, length_package);
                    ASSERT(result == length_package);

                    for (int x = 0; x < length_package; x++) {
                        //printf("i= %i  i&0xFF= %i  recv_buf[x]= %i  j= %i counter= %i\n", i, i & 0xFF, recv_buf[x] & 0xFF, j, counter);
                        ASSERT((unsigned char)(i & 0xFF) == recv_buf[x]);
                    }

                    if (j == packages - 1)
                        printf("Received block %i of %i packages\n", i, packages);

                    if (counter >= blocks * packages) {
                        uv_sem_post(&sem);
                        printf("Client finished, %i blocks of %i packets, total received %i \n", blocks, packages, counter);
                    }
                });

            }
        }
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    uv_sem_init(&sem, 0);

    printf("Close accepted socket\n");

    acc.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem);
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    uv_sem_init(&sem, 0);

    printf("Close client socket\n");

    cli.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem);
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    //close TCP server
    uv_sem_init(&sem, 0);

    printf("Close server\n");

    srv.close([&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        uv_sem_post(&sem);
    });

    uv_sem_wait(&sem);
    uv_sem_destroy(&sem);

    printf("stressTestTCP done\n\n");
}