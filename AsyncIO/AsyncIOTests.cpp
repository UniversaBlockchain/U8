//
// Created by Tairov Dmitriy on 18.01.19.
//

#include <thread>
#include "AsyncIO.h"

using namespace std;

#define NUM_THREADS     5
#define BUFF_SIZE       4096
#define NUM_ITERATIONS  5
#define NUM_BLOCKS      256

typedef unsigned long ulong;
std::shared_ptr<asyncio::IOHandle> file[NUM_THREADS];
asyncio::byte_vector dataBuf[NUM_THREADS];
uv_sem_t stop[NUM_THREADS];
size_t fileSize[NUM_THREADS];
int summ[NUM_THREADS];
int block[NUM_THREADS];

void testAsyncFile() {
    printf("testAsyncFile()...\n");

    vector<thread> ths;

    asyncio::initAndRunLoop();

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

                asyncio::writeFile_cb onWrite = [t, &onWrite](ssize_t result) {
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else {
                        fileSize[t] += result;

                        if (++block[t] < NUM_BLOCKS)
                            file[t]->write(dataBuf[t], onWrite);
                        else
                            file[t]->close([t](ssize_t result) {
                                uv_sem_post(&stop[t]);
                                printf("Close file in thread: %ld\n", t + 1);
                            });
                    }
                };

                file[t]->open(fileName, O_CREAT | O_WRONLY, S_IRWXU | S_IRWXG | S_IRWXO, [t, onWrite](ssize_t result) {
                    printf("Open file for writing in thread %ld\n", t + 1);
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else
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
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size (writing) in thread %i\n", t + 1);
        all += fileSize[t];
    }

    ths.clear();

    printf("Threads completed\n");

    double fTimeStop = clock() / (double)CLOCKS_PER_SEC;
    printf("Time of writing %i files %f sec.\nTotal files size %ld bytes\n", NUM_THREADS * NUM_ITERATIONS, fTimeStop - fTimeStart, all);

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

                asyncio::readFile_cb onRead = [t, &onRead](const asyncio::byte_vector& data, ssize_t result) {
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else if (result == 0)
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
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else
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
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size in thread %ld\n", t + 1);
        if (summ[t] != -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2)
            fprintf(stderr, "mismatch test file sum in thread %ld\n", t + 1);
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

                asyncio::readFileBuffer_cb onRead = [&](ssize_t result) {
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else if (result == 0)
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
                    if (asyncio::isError(result))
                        fprintf(stderr, "error: %s\n", asyncio::getError(result));
                    else
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
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size in thread %ld\n", t + 1);
        if (summ[t] != -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2)
            fprintf(stderr, "mismatch test file sum in thread %ld\n", t + 1);
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

                asyncio::writeFile_cb onWrite = [t, &onWrite](ssize_t result) {
                    if (asyncio::isError(result))
                        fprintf(stderr, "write error: %s\n", asyncio::getError(result));
                    else {
                        fileSize[t] += result;

                        if (++block[t] < NUM_BLOCKS)
                            file[t]->write(dataBuf[t], onWrite);
                        else
                            file[t]->close([t](ssize_t result) {
                                uv_sem_post(&stop[t]);
                                printf("Close file in thread: %ld\n", t + 1);
                            });
                    }
                };

                asyncio::file::openWrite(fileName, [t, onWrite](std::shared_ptr<asyncio::IOHandle> handle, ssize_t result) {
                    printf("Open file for writing in thread %ld\n", t + 1);
                    if (asyncio::isError(result))
                        fprintf(stderr, "open error: %s\n", asyncio::getError(result));
                    else {
                        file[t] = handle;
                        file[t]->write(dataBuf[t], onWrite);
                    }
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
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size (writing) in thread %i\n", t + 1);
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

                asyncio::readFile_cb onRead = [t, &onRead](const asyncio::byte_vector& data, ssize_t result) {
                    if (asyncio::isError(result))
                        fprintf(stderr, "read error: %s\n", asyncio::getError(result));
                    else if (result == 0)
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
                    if (asyncio::isError(result))
                        fprintf(stderr, "open error: %s\n", asyncio::getError(result));
                    else {
                        file[t] = handle;
                        file[t]->read(BUFF_SIZE, onRead);
                    }
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
        if (fileSize[t] != BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS)
            fprintf(stderr, "mismatch test file size in thread %ld\n", t + 1);
        if (summ[t] != -BUFF_SIZE * NUM_BLOCKS * NUM_ITERATIONS / 2)
            fprintf(stderr, "mismatch test file sum in thread %ld\n", t + 1);
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

                long sum = 0;
                ulong size = data.size();
                char* buf = (char*) data.data();
                for (int n = 0; n < size; n++)
                    sum += buf[n];

                if (sum != -BUFF_SIZE * NUM_BLOCKS / 2)
                    fprintf(stderr, "mismatch test file sum in readFileCallback\n");

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

        if (sum != (10 + 19) * 5)
            fprintf(stderr, "mismatch the part of file sum in readFilePartCallback\n");

        uv_sem_post(&stop[0]);
    });

    asyncio::file::readFilePart("TestFile0.bin", BUFF_SIZE * NUM_BLOCKS - 256, 500, [](const asyncio::byte_vector& data, ssize_t result) {
        printf("Read the part of file. Size = %i. Result = %i\n", (int) data.size(), (int) result);

        long sum = 0;
        ulong size = data.size();
        char* buf = (char*) data.data();
        for (int n = 0; n < size; n++)
            sum += buf[n];

        if (size != 256)
            fprintf(stderr, "mismatch the part of file size in readFilePartCallback\n");
        if (sum != -128)
            fprintf(stderr, "mismatch the part of file sum in readFilePartCallback\n");

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

            long sum = 0;
            ulong size = data.size();
            char* buf = (char*) data.data();
            for (int n = 0; n < size; n++)
                sum += buf[n];

            char x = 10;
            long expected = -128 * (result / 256);
            for (int i = 0; i < result % 256; i++)
                expected += x++;

            if (sum != expected)
                fprintf(stderr, "mismatch the part of file sum in readFilePart with timeout\n");

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
        if (!asyncio::isError(result))
            printf("File open\n");

        fc->read(1000, [&](const asyncio::byte_vector& data, ssize_t result) {
            if (!asyncio::isError(result))
                printf("Read %ld bytes\n", result);

            fc->write(data, [&](ssize_t result) {
                if (!asyncio::isError(result))
                    printf("Wrote %ld bytes\n", result);

                uv_sem_post(&stop[0]);
            });

            fc.reset();
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
        if (!asyncio::isError(result))
            printf("File open\n");

        f->read(100)->then([&](const asyncio::byte_vector& data, ssize_t result) {
            if (!asyncio::isError(result))
                printf("Read %ld bytes\n", result);

            f->write(data)->then([&](ssize_t result) {
                if (!asyncio::isError(result))
                    printf("Wrote %ld bytes\n", result);

                f->close()->then([&](ssize_t result) {
                    if (!asyncio::isError(result))
                        printf("File closed\n");

                    uv_sem_post(&stop[0]);
                });
            });
        });
    });

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Scan directory test...\n");

    auto dir = std::make_shared<asyncio::IOHandle>();

    auto dirLambda = [&](ssize_t result) {
        if (!asyncio::isError(result))
            printf("Directory open for scan\n");

        asyncio::ioDirEntry entry;
        while (dir->next(&entry)) {
            if (asyncio::isFile(entry))
                printf("File: %s\n", entry.name);
            else if (asyncio::isDir(entry))
                printf("Directory: %s\n", entry.name);
            else
                printf("Other: %s\n", entry.name);
        }

        uv_sem_post(&stop[0]);
    };

    // check 2 types syntax
    uv_sem_init(&stop[0], 0);

    dir->openDir(".", dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    dir = std::make_shared<asyncio::IOHandle>();

    uv_sem_init(&stop[0], 0);

    dir->openDir(".")->then(dirLambda);

    uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    printf("Remove files test...\n");

    uv_sem_init(&stop[0], 0);

    for (int t = 0; t < NUM_THREADS; t++) {
        char fileName[22];
        snprintf(fileName, 22, "TestFile%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
            if (!asyncio::isError(result))
                printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestEntireFile%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
            if (!asyncio::isError(result))
                printf("File %s deleted.\n", fileName);

            uv_sem_post(&stop[0]);
        });

        snprintf(fileName, 22, "TestOpenWrite%i.bin", t);

        asyncio::file::remove(fileName, [=](ssize_t result) {
            if (!asyncio::isError(result))
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
            if (!asyncio::isError(result))
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
            if (!asyncio::isError(result))
                printf("Directory %s removed.\n", dirName);

            uv_sem_post(&stop[0]);
        });
    }

    for (int i = 0; i < NUM_THREADS; i++)
        uv_sem_wait(&stop[0]);
    uv_sem_destroy(&stop[0]);

    asyncio::deinitLoop();

    printf("testAsyncFile()...done\n\n");
}