/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "catch2.h"
#include <iostream>
#include <memory.h>
#include <limits.h>
#include "testutils.h"
#include "../AsyncIO/IOTCP.h"
#include "../tools/Semaphore.h"

using namespace std;

TEST_CASE("asyncio_tcp_bench") {

    int NUM_CLIENTS = 40;
    int TEST_DURATION_SECONDS = 3;

    struct SrvClient {
        std::mutex mtx;
        asyncio::IOTCP* conn = nullptr;
        std::function<void()> doRead;
        byte_vector readBuf;
    };

    std::mutex srvMtx;
    asyncio::IOTCP srv;
    vector<std::shared_ptr<SrvClient>> srvClients;

    srv.open("127.0.0.1", 9990, [&srvMtx,&srv,&srvClients](ssize_t result) {
        REQUIRE(!asyncio::isError(result));
        //printf("srv accept\n");
        {
            lock_guard lock(srvMtx);
            auto srvClient = std::make_shared<SrvClient>();
            srvClient->conn = srv.accept();
            srvClient->conn->enableKeepAlive(60);

            srvClient->doRead = [srvClient](){
                srvClient->conn->read(4096, [srvClient](const asyncio::byte_vector& data, ssize_t result) {
                    if (asyncio::isError(result))
                        printf("conn->read... error: %s\n", asyncio::getError(result));
                    if (result == 0) {
                        srvClient->conn->close([](ssize_t result){});
                        return;
                    }
                    byte_vector bv((size_t)result);
                    memcpy(&bv[0], &data[0], (size_t)result);
                    std::string s = bytesToString(srvClient->readBuf) + bytesToString(bv);
                    //printf("read (%li bytes): %s\n", result, s.data());
                    int sz = (int)s.size();
                    int pos = 0;
                    while (sz - pos >= 24) {
                        std::string packet = s.substr((size_t)pos, (size_t)24);
                        pos += 24;
                        //printf("recv: %s\n", packet.data());
                        packet[1] = 'o';
                        srvClient->conn->write(stringToBytes(packet), [](ssize_t result){
                            REQUIRE(!asyncio::isError(result));
                        });
                    }
                    if (pos != sz) {
                        //srvClient->readBuf = stringToBytes(s.substr((size_t)pos));
                        byte_vector tail = stringToBytes(s.substr((size_t)pos));
                        srvClient->readBuf.insert(srvClient->readBuf.end(), tail.begin(), tail.end());
                    } else {
                        srvClient->readBuf.clear();
                    }
                    srvClient->doRead();
                });
            };

            srvClient->doRead();

            srvClients.emplace_back(srvClient);
        }
    });

    struct TestClient {
        std::mutex mtx;
        std::shared_ptr<asyncio::IOTCP> conn;
        byte_vector readBuf;
    };

    Semaphore semConnect;
    std::mutex testClientsMtx;
    vector<std::shared_ptr<TestClient>> testClients;
    for (int i = 0; i < NUM_CLIENTS; ++i) {
        auto tc = std::make_shared<TestClient>();
        tc->conn = std::make_shared<asyncio::IOTCP>();
        tc->conn->connect("127.0.0.1", (unsigned int)(20000+i), "127.0.0.1", 9990, [i,&semConnect](ssize_t result){
            REQUIRE(!asyncio::isError(result));
            //printf("test client (i=%i): connected\n", i);
            semConnect.notify();
        });
        lock_guard lock(testClientsMtx);
        testClients.emplace_back(tc);
    }

    for (int i = 0; i < NUM_CLIENTS; ++i)
        semConnect.wait();

    Semaphore semAnswers;
    atomic<long> sendCounter = 0;
    atomic<long> answersCounter = 0;
    std::mutex t0mtx;
    atomic<long> t0 = getCurrentTimeMillis();
    atomic<long> count0 = 0;
    long startTime = getCurrentTimeMillis();

    vector<std::shared_ptr<thread>> clientThreads;
    for (int i = 0; i < NUM_CLIENTS; ++i) {
        auto tc = testClients[i];
        auto th = std::make_shared<thread>([tc,&sendCounter,&answersCounter,&t0mtx,&t0,&count0,&semAnswers,startTime,TEST_DURATION_SECONDS]() {
            for (long i = 0; i < LONG_MAX; ++i) {
                std::string packet = std::to_string(i);
                packet = "ping" + std::string(20-packet.size(), '0') + packet;
                std::string awaitAnswer = packet;
                awaitAnswer[1] = 'o';

                if (getCurrentTimeMillis() - startTime > TEST_DURATION_SECONDS*1000)
                    break;

                ++sendCounter;
                Semaphore semSend;
                tc->conn->write(stringToBytes(packet), [tc,awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0,&semSend](ssize_t result) {
                    REQUIRE(!asyncio::isError(result));
                    tc->conn->read(24, [tc,awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0,&semSend](const asyncio::byte_vector& data, ssize_t result) {
                        byte_vector bv((size_t)result);
                        memcpy(&bv[0], &data[0], (size_t)result);
                        if ((result > 0) && (result < 24)) {
                            tc->readBuf.insert(tc->readBuf.end(), bv.begin(), bv.end());
                        } else {
                            std::string s = bytesToString(tc->readBuf) + bytesToString(bv);

                            REQUIRE(s == awaitAnswer);
                            ++answersCounter;
                            {
                                lock_guard t0lock(t0mtx);
                                long now = getCurrentTimeMillis();
                                long dt = now - t0;
                                if (dt >= 1000) {
                                    t0 = now;
                                    long count = answersCounter - count0;
                                    float rps = float(count) * 1000.0f / float(dt);
                                    count0 = (long) answersCounter;
                                    printf("answersCounter: %li, rps = %.1f\n", (long) answersCounter, rps);
                                }
                            }
                            semAnswers.notify();
                            tc->readBuf.clear();

                            semSend.notify();
                        }
                    });
                });
                semSend.wait();
            }
        });
        clientThreads.emplace_back(th);
    }

    while (sendCounter == 0)
        this_thread::sleep_for(10ms);

    for (int i = 0; i < sendCounter; ++i)
        semAnswers.wait();

    Semaphore semTerm;
    srv.close([&semTerm](ssize_t result){
        REQUIRE(!asyncio::isError(result));
        semTerm.notify();
    });
    semTerm.wait();
    for (auto tc : testClients) {
        tc->conn->close([&semTerm](ssize_t result){
            REQUIRE(!asyncio::isError(result));
            semTerm.notify();
        });
        semTerm.wait();
    }
    for (auto th : clientThreads)
        th->join();

}

TEST_CASE("asyncio_tcp_bench_server", "[!hide]") {
    std::string testName = Catch::getResultCapture().getCurrentTestName();

    string serverIp = inputTestParameter(testName, "enter server ip", "0.0.0.0");
    string serverPort = inputTestParameter(testName, "enter server port", "9990");
    string duration = inputTestParameter(testName, "enter test duration in seconds", "300");

    struct SrvClient {
        std::mutex mtx;
        asyncio::IOTCP* conn = nullptr;
        std::function<void()> doRead;
        byte_vector readBuf;
    };

    std::mutex srvMtx;
    asyncio::IOTCP srv;
    vector<std::shared_ptr<SrvClient>> srvClients;

    srv.open(serverIp.data(), (unsigned int)std::stoul(serverPort), [&srvMtx,&srv,&srvClients](ssize_t result) {
        REQUIRE(!asyncio::isError(result));
        //printf("srv accept\n");
        {
            lock_guard lock(srvMtx);
            auto srvClient = std::make_shared<SrvClient>();
            srvClient->conn = srv.accept();
            srvClient->conn->enableKeepAlive(60);

            srvClient->doRead = [srvClient](){
                srvClient->conn->read(4096, [srvClient](const asyncio::byte_vector& data, ssize_t result) {
                    if (asyncio::isError(result))
                        printf("conn->read... error: %s\n", asyncio::getError(result));
                    if (result == 0) {
                        srvClient->conn->close([](ssize_t result){});
                        return;
                    }
                    byte_vector bv((size_t)result);
                    memcpy(&bv[0], &data[0], (size_t)result);
                    std::string s = bytesToString(srvClient->readBuf) + bytesToString(bv);
                    //printf("read (%li bytes): %s\n", result, s.data());
                    int sz = (int)s.size();
                    int pos = 0;
                    while (sz - pos >= 24) {
                        std::string packet = s.substr((size_t)pos, (size_t)24);
                        pos += 24;
                        //printf("recv: %s\n", packet.data());
                        packet[1] = 'o';
                        srvClient->conn->write(stringToBytes(packet), [](ssize_t result){
                            REQUIRE(!asyncio::isError(result));
                        });
                    }
                    if (pos != sz) {
//                        srvClient->readBuf = stringToBytes(s.substr((size_t) pos));
                        byte_vector tail = stringToBytes(s.substr((size_t)pos));
                        srvClient->readBuf.insert(srvClient->readBuf.end(), tail.begin(), tail.end());
                    } else {
                        srvClient->readBuf.clear();
                    }
                    srvClient->doRead();
                });
            };

            srvClient->doRead();

            srvClients.emplace_back(srvClient);
        }
    });

    printf("server has started\n");

    printf("wait for %s seconds...\n", duration.data());
    std::this_thread::sleep_for(std::chrono::seconds(std::stoul(duration)));

    Semaphore semTerm;
    srv.close([&semTerm](ssize_t result){
        REQUIRE(!asyncio::isError(result));
        semTerm.notify();
    });
    semTerm.wait();

    printf("server has stopped.\n");
}

TEST_CASE("asyncio_tcp_bench_client", "[!hide]") {
    std::string testName = Catch::getResultCapture().getCurrentTestName();

    string serverIp = inputTestParameter(testName, "enter server ip", "0.0.0.0");
    string serverPort = inputTestParameter(testName, "enter server port", "9990");
    string clientsCount = inputTestParameter(testName, "enter clients count", "40");
    string duration = inputTestParameter(testName, "enter test duration in seconds", "30");

    int NUM_CLIENTS = std::stoi(clientsCount);
    int TEST_DURATION_SECONDS = std::stoi(duration);

    struct TestClient {
        std::mutex mtx;
        std::shared_ptr<asyncio::IOTCP> conn;
        byte_vector readBuf;
    };

    Semaphore semConnect;
    std::mutex testClientsMtx;
    vector<std::shared_ptr<TestClient>> testClients;
    for (int i = 0; i < NUM_CLIENTS; ++i) {
        auto tc = std::make_shared<TestClient>();
        tc->conn = std::make_shared<asyncio::IOTCP>();
        tc->conn->connect("0.0.0.0", (unsigned int)(20000+i), serverIp.data(), (unsigned int)std::stoul(serverPort), [i,&semConnect](ssize_t result){
            REQUIRE(!asyncio::isError(result));
            //printf("test client (i=%i): connected\n", i);
            semConnect.notify();
        });
        lock_guard lock(testClientsMtx);
        testClients.emplace_back(tc);
    }

    for (int i = 0; i < NUM_CLIENTS; ++i)
        semConnect.wait();

    Semaphore semAnswers;
    atomic<long> sendCounter = 0;
    atomic<long> answersCounter = 0;
    std::mutex t0mtx;
    atomic<long> t0 = getCurrentTimeMillis();
    atomic<long> count0 = 0;
    long startTime = getCurrentTimeMillis();

    vector<std::shared_ptr<thread>> clientThreads;
    for (int i = 0; i < NUM_CLIENTS; ++i) {
        auto tc = testClients[i];
        auto th = std::make_shared<thread>([tc,&sendCounter,&answersCounter,&t0mtx,&t0,&count0,&semAnswers,startTime,TEST_DURATION_SECONDS]() {
            for (long i = 0; i < LONG_MAX; ++i) {
                std::string packet = std::to_string(i);
                packet = "ping" + std::string(20-packet.size(), '0') + packet;
                std::string awaitAnswer = packet;
                awaitAnswer[1] = 'o';

                if (getCurrentTimeMillis() - startTime > TEST_DURATION_SECONDS*1000)
                    break;

                ++sendCounter;
                Semaphore semSend;
                tc->conn->write(stringToBytes(packet), [tc,awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0,&semSend](ssize_t result) {
                    REQUIRE(!asyncio::isError(result));
                    tc->conn->read(24, [tc,awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0,&semSend](const asyncio::byte_vector& data, ssize_t result) {
                        byte_vector bv((size_t)result);
                        memcpy(&bv[0], &data[0], (size_t)result);
                        if ((result > 0) && (result < 24)) {
                            tc->readBuf.insert(tc->readBuf.end(), bv.begin(), bv.end());
                        } else {
                            std::string s = bytesToString(tc->readBuf) + bytesToString(bv);

                            REQUIRE(s == awaitAnswer);
                            ++answersCounter;
                            {
                                lock_guard t0lock(t0mtx);
                                long now = getCurrentTimeMillis();
                                long dt = now - t0;
                                if (dt >= 1000) {
                                    t0 = now;
                                    long count = answersCounter - count0;
                                    float rps = float(count) * 1000.0f / float(dt);
                                    count0 = (long) answersCounter;
                                    printf("answersCounter: %li, rps = %.1f\n", (long) answersCounter, rps);
                                }
                            }
                            semAnswers.notify();
                            tc->readBuf.clear();

                            semSend.notify();
                        }
                    });
                });
                semSend.wait();
            }
        });
        clientThreads.emplace_back(th);
    }

    while (sendCounter == 0)
        this_thread::sleep_for(10ms);

    for (int i = 0; i < sendCounter; ++i)
        semAnswers.wait();

    for (auto th : clientThreads)
        th->join();
    Semaphore semTerm;
    for (auto tc : testClients) {
        tc->conn->close([&semTerm](ssize_t result){
            REQUIRE(!asyncio::isError(result));
            semTerm.notify();
        });
        semTerm.wait();
    }

}
