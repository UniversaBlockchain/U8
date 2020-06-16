/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "catch2.h"
#include <iostream>
#include <memory.h>
#include <limits.h>
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
                    if (pos != sz)
                        srvClient->readBuf = stringToBytes(s.substr((size_t)pos));
                    else
                        srvClient->readBuf.clear();
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
    ThreadPool pool(NUM_CLIENTS);
    atomic<long> sendCounter = 0;
    atomic<long> answersCounter = 0;
    std::mutex t0mtx;
    atomic<long> t0 = getCurrentTimeMillis();
    atomic<long> count0 = 0;
    long startTime = getCurrentTimeMillis();
    for (long i = 0; i < LONG_MAX; ++i) {
        pool.execute([&testClients,&testClientsMtx,i,&semAnswers,&answersCounter,&t0mtx,&t0,&count0,&sendCounter](){
            std::shared_ptr<TestClient> tc;
            {
                lock_guard lock(testClientsMtx);
                tc = testClients[i % testClients.size()];
            }
            {
                lock_guard lock(tc->mtx);
                std::string packet = std::to_string(i);
                packet = "ping" + std::string(20-packet.size(), '0') + packet;
                std::string awaitAnswer = packet;
                awaitAnswer[1] = 'o';

                ++sendCounter;
                tc->conn->write(stringToBytes(packet), [tc,awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0](ssize_t result){
                    REQUIRE(!asyncio::isError(result));
                    tc->conn->read(24, [awaitAnswer,&semAnswers,&answersCounter,&t0mtx,&t0,&count0](const asyncio::byte_vector& data, ssize_t result) {
                        REQUIRE(result == 24);
                        byte_vector bv((size_t)result);
                        memcpy(&bv[0], &data[0], (size_t)result);
                        std::string s = bytesToString(bv);
                        //printf("answer: %s\n", s.data());
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
                                count0 = (long)answersCounter;
                                printf("answersCounter: %li, rps = %.1f\n", (long)answersCounter, rps);
                            }
                        }
                        semAnswers.notify();
                    });
                });

            }
        });
        if (sendCounter > answersCounter + 50000)
            this_thread::sleep_for(10ms);
        if (getCurrentTimeMillis() - startTime > TEST_DURATION_SECONDS*1000)
            break;
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

}
