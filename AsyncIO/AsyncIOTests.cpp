//
// Created by Tairov Dmitriy on 18.01.19.
//

#include <thread>
#include <cstring>

#include "AsyncIO.h"
#include "AsyncIOTests.h"

using namespace std;

#define NUM_THREADS     5
#define BUFF_SIZE       4096
#define NUM_ITERATIONS  10
#define NUM_BLOCKS      256

#define PORT            10000

typedef unsigned long ulong;
std::shared_ptr<asyncio::IOHandle> file[NUM_THREADS];
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
    for (int i=0; i< 100; i++)
    testUnifyFileAndTCPread();

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
        dataBuf[t].reserve(BUFF_SIZE);
        for (uint i = 0; i < BUFF_SIZE; i++)
            dataBuf[t].push_back((uint8_t) i & 0xFF);

        ths.emplace_back([t](){
            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);
                block[t] = 0;

                char fileName[16];
                snprintf(fileName, 16, "TestFile%ld.bin", t);

                file[t] = std::make_shared<asyncio::IOHandle>();

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

                file[t] = std::make_shared<asyncio::IOHandle>();

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

                asyncio::file::openWrite(fileName, [t, onWrite](std::shared_ptr<asyncio::IOHandle> handle, ssize_t result) {
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

                asyncio::file::openRead(fileName, [t, onRead](std::shared_ptr<asyncio::IOHandle> handle, ssize_t result) {
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
            asyncio::file::readFile(fileName, [](const asyncio::byte_vector& data, ssize_t result) {
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

        asyncio::file::writeFile(fileName, dataBuf[t], [](ssize_t result) {
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

    asyncio::file::readFilePart("TestEntireFile0.bin", 10, 10, [](const asyncio::byte_vector& data, ssize_t result) {
        printf("Read the part of file. Size = %i. Result = %i\n", (int) data.size(), (int) result);

        long sum = 0;
        ulong size = data.size();
        char* buf = (char*) data.data();
        for (int n = 0; n < size; n++)
            sum += buf[n];

        ASSERT(sum == (10 + 19) * 5);

        uv_sem_post(&stop[0]);
    });

    asyncio::file::readFilePart("TestFile0.bin", BUFF_SIZE * NUM_BLOCKS - 256, 500, [](const asyncio::byte_vector& data, ssize_t result) {
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

        asyncio::file::readFilePart(fileName, 10, BUFF_SIZE * NUM_BLOCKS,
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

    auto fc = std::make_shared<asyncio::IOHandle>();

    fc->open("TestFile0.bin", O_RDWR, 0, [&](ssize_t result) {
        ASSERT(!asyncio::isError(result));
        printf("File open\n");

        fc->read(1000, [&](const asyncio::byte_vector& data, ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Read %ld bytes\n", result);

            fc->write(data, [&](ssize_t result) {
                ASSERT(!asyncio::isError(result));
                printf("Wrote %ld bytes\n", result);

                uv_sem_post(&stop[0]);

                fc.reset();
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

    auto f = std::make_shared<asyncio::IOHandle>();

    f->open("TestFile0.bin", O_RDWR, 0)->then([&](ssize_t result) {
        ASSERT(!asyncio::isError(result));
        printf("File open\n");

        f->read(100)->then([&](const asyncio::byte_vector& data, ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Read %ld bytes\n", result);

            f->write(data)->then([&](ssize_t result) {
                ASSERT(!asyncio::isError(result));
                printf("Wrote %ld bytes\n", result);

                f->close()->then([&](ssize_t result) {
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

    auto dir = std::make_shared<asyncio::IOHandle>();

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

            asyncio::file::stat(name.data(), [=](asyncio::ioStat stat, ssize_t result) {
                printf("%s: %s. Size = %lu Mode = %lu\n", type.data(), name.data(),
                        (unsigned long) stat.st_size, (unsigned long) stat.st_mode);
            });
        }

        uv_sem_post(&stop[0]);
    };

    // check 2 types syntax
    uv_sem_init(&stop[0], 0);

    dir->openDir(".", dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    auto dirThen = std::make_shared<asyncio::IOHandle>();

    uv_sem_init(&stop[0], 0);

    dirThen->openDir(".")->then(dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Remove files test...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[22];
        snprintf(fileName, 22, "TestFile%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestEntireFile%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestOpenWrite%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
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

        asyncio::dir::createDir(dirName, S_IRWXU | S_IRWXG | S_IRWXO, [=](ssize_t result) {
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

        asyncio::dir::removeDir(dirName, [=](ssize_t result) {
            ASSERT(!asyncio::isError(result));
            printf("Directory %s removed.\n", dirName);

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("testAsyncFile()...done\n\n");
}

void testAsyncUDP() {
    printf("testAsyncUDP()...\n");

    vector<thread> ths;

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            asyncio::ioLoop* loop_srv = asyncio::asyncLoop;
            asyncio::ioLoop* loop_cli = asyncio::initAndRunAuxLoop();

            if (t > 0)
                loop_srv = asyncio::initAndRunAuxLoop();

            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOHandle srv(loop_srv);
                asyncio::IOHandle cli(loop_cli);

                uv_sem_init(&stop[t], 0);

                srv.openUDP("127.0.0.1", PORT + (unsigned int)t);

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

                cli.openUDP("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

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

            if (t > 0)
                asyncio::deinitAuxLoop(loop_srv);

            asyncio::deinitAuxLoop(loop_cli);
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test with byte-vectors successful\n");

    ths.clear();

    for (long t = 0; t < NUM_THREADS; t++) {
        ths.emplace_back([t]() {
            asyncio::ioLoop* loop_srv = asyncio::asyncLoop;
            asyncio::ioLoop* loop_cli = asyncio::initAndRunAuxLoop();

            if (t > 0)
                loop_srv = asyncio::initAndRunAuxLoop();

            for (int i = 0; i < NUM_ITERATIONS; i++) {
                asyncio::IOHandle srv(loop_srv);
                asyncio::IOHandle cli(loop_cli);

                uv_sem_init(&stop[t], 0);

                srv.openUDP("127.0.0.1", PORT + (unsigned int)t);

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

                cli.openUDP("127.0.0.1", PORT + NUM_THREADS + (unsigned int)t);

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

            if (t > 0)
                asyncio::deinitAuxLoop(loop_srv);

            asyncio::deinitAuxLoop(loop_cli);
        });
    }

    for (int t = 0; t < NUM_THREADS; t++)
        ths[t].join();

    printf("test with memory buffers successful\n");

    printf("testAsyncUDP()...done\n\n");
}

void testAsyncTCP() {
    printf("testAsyncTCP()...\n");

    uv_sem_t sem_tcp_srv;
    uv_sem_init(&sem_tcp_srv, 0);

    uv_mutex_t clients_mutex;
    uv_mutex_init(&clients_mutex);

    //init TCP server
    asyncio::IOHandle srv;
    vector<shared_ptr<asyncio::IOHandle>> clients;

    srv.openTCP("127.0.0.1", PORT, [&](ssize_t result){
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
            asyncio::ioLoop* loop = asyncio::initAndRunAuxLoop();

            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOHandle cli(loop);

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i, "127.0.0.1", PORT, [&](ssize_t result){
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

            asyncio::deinitAuxLoop(loop);
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
    asyncio::IOHandle srv_buff;
    vector<char*> buffs;

    srv_buff.openTCP("127.0.0.1", PORT, [&](ssize_t result){
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
            asyncio::ioLoop* loop = asyncio::initAndRunAuxLoop();

            for (int i = 0; i < NUM_ITERATIONS; i++) {
                uv_sem_init(&stop[t], 0);

                asyncio::IOHandle cli(loop);

                char buff_cli[5];

                cli.connect("127.0.0.1", PORT + (unsigned int) t * NUM_ITERATIONS + i, "127.0.0.1", PORT, [&](ssize_t result){
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

            asyncio::deinitAuxLoop(loop);
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
    asyncio::IOHandle srv_part;

    uv_sem_init(&sem_tcp_srv, 0);

    srv_part.openTCP("127.0.0.1", PORT, [&](ssize_t result){
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
    asyncio::ioLoop* loop = asyncio::initAndRunAuxLoop();
    asyncio::IOHandle cli(loop);

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

    asyncio::IOHandle nonexistentClient;

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

    printf("partial read test successful\n");

    clients.clear();

    asyncio::deinitAuxLoop(loop);

    printf("testAsyncTCP()...done\n\n");
}

void testUnifyFileAndTCPread() {
    printf("testUnifyFileAndTCPread()...\n");

    uv_sem_t sem;
    uv_sem_init(&sem, 0);

    // FILE
    asyncio::IOHandle file;

    file.open("UnifyTest.txt", O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, [&](ssize_t result) {
        ASSERT(!asyncio::isError(result));

        file.write((void*) "ABCDEFGHIJ", 9, [&](ssize_t result){
            ASSERT(result == 9);

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
                        ASSERT(result == 0);
                        //ASSERT(!memcmp("J", buff, 1));

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

    printf("unify file read test successful\n");

    // TCP
    /*asyncio::IOHandle srv;
    asyncio::IOHandle acc;

    uv_sem_init(&sem, 0);

    srv.openTCP("127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("New connection\n");

        int res = acc.acceptFromListeningSocket(&srv);
        ASSERT(!asyncio::isError(res));

        acc.write((void*) "ABCDEFGHIJ", 9, [&](ssize_t result){
            ASSERT(result == 9);

            acc.close([&](ssize_t result){
                ASSERT(!asyncio::isError(result));

                uv_sem_post(&sem);
            });
        });
    });

    asyncio::ioLoop* loop = asyncio::initAndRunAuxLoop();
    asyncio::IOHandle cli(loop);

    cli.connect("127.0.0.1", PORT + 1, "127.0.0.1", PORT, [&](ssize_t result){
        ASSERT(!asyncio::isError(result));

        printf("Connected to server\n");

        cli.read(buff, 3, [&](ssize_t result){
            ASSERT(result == 3);
            ASSERT(!memcmp("ABC", buff, 3));

            printf("Server received: ABC\n");

            cli.read(buff, 3, [&](ssize_t result){
                ASSERT(result == 3);
                ASSERT(!memcmp("DEF", buff, 3));

                printf("Server received: DEF\n");

                cli.read(buff, 3, [&](ssize_t result){
                    ASSERT(result == 3);
                    ASSERT(!memcmp("GHI", buff, 3));

                    printf("Server received: GHI\n");

                    cli.read(buff, 3, [&](ssize_t result){
                        ASSERT(result == 0);

                        //ASSERT(!memcmp("J", buff, 1));
                        printf("Server received: J\n");

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

    printf("unify tcp read test successful\n");

    asyncio::deinitAuxLoop(loop);*/

    printf("testUnifyFileAndTCPread()...done\n\n");
}
