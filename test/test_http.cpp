//
// Created by Leonid Novikov on 4/17/19.
//

#include <thread>
#include <atomic>
#include "catch2.h"
#include "../network/HttpServer.h"
#include "../network/HttpClient.h"
#include "../tools/Semaphore.h"

using namespace std;
using namespace network;

TEST_CASE("http_hello") {
    HttpServer httpServer("0.0.0.0", 8080);
    atomic<int> counter(0);
    httpServer.addEndpoint("/testPage", [&counter](HttpServerRequest& request){
        request.setHeader("Server", "Universa node");
        request.setAnswerBody("testPage answer #"+to_string(++counter));
        request.sendAnswer();
    });
    httpServer.start();

    HttpClient httpClient;
    httpClient.start();

    Semaphore sem;
    atomic<int> readyCounter(0);
    //int countToSend = 200000000;
    int countToSend = 2000;

    long ts0 = getCurrentTimeMillis();
    int counter0 = 0;
    auto handler = [&sem,&readyCounter,countToSend,&ts0,&counter0](int respCode, string&& body){
        //printf("resp(%i): %s\n", respCode, body.c_str());
        if (++readyCounter >= countToSend)
            sem.notify();
        long dts = getCurrentTimeMillis() - ts0;
        if (dts >= 1000) {
            printf("readyCounter=%i, rps=%li\n", int(readyCounter), (readyCounter-counter0)*1000/dts);
            counter0 = readyCounter;
            ts0 = getCurrentTimeMillis();
        }
    };

    long t0 = getCurrentTimeMillis();
    for (int i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("localhost:8080/testPage", handler);
        if (readyCounter+200 < i)
            this_thread::sleep_for(10ms);
    }

    sem.wait();
    long dt = getCurrentTimeMillis() - t0;
    printf("total time = %li ms, rps = %li\n", dt, readyCounter*1000/dt);

    httpServer.stop();
    httpServer.join();
    httpClient.stop();
    httpClient.join();
    printf("all done, stop server and client... ok\n");
}
