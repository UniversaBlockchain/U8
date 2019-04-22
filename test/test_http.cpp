//
// Created by Leonid Novikov on 4/17/19.
//

#include <thread>
#include <atomic>
#include "catch2.h"
#include "../network/HttpServer.h"
#include "../network/HttpClient.h"
#include "../tools/Semaphore.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/PublicKey.h"

using namespace std;
using namespace network;

TEST_CASE("http_hello") {
    HttpServer httpServer("0.0.0.0", 8080);
    atomic<int> counter(0);
    crypto::PrivateKey privateKey(4096);
    crypto::PublicKey publicKey(privateKey);
    httpServer.addEndpoint("/testPage", [&counter,&publicKey](HttpServerRequest& request){
        request.setHeader("Server", "Universa node");
        string answer("testPage answer #"+to_string(++counter));
        byte_vector bv(answer.begin(), answer.end());
        request.setAnswerBody(publicKey.encrypt(bv));
        request.sendAnswerFromAnotherThread();
    });
    httpServer.start();

    HttpClient httpClient;

    Semaphore sem;
    atomic<int> readyCounter(0);
    //int countToSend = 200000000;
    int countToSend = 2000;

    atomic<long> ts0 = getCurrentTimeMillis();
    atomic<int> counter0 = 0;

    long t0 = getCurrentTimeMillis();
    for (int i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("localhost:8080/testPage", [&sem,&readyCounter,countToSend,&ts0,&counter0](int respCode, string&& body){
            //printf("resp(%i): %s\n", respCode, body.c_str());
            if (++readyCounter >= countToSend)
                sem.notify();
            long dts = getCurrentTimeMillis() - ts0;
            if (dts >= 1000) {
                printf("readyCounter=%i, rps=%li\n", int(readyCounter), (readyCounter-counter0)*1000/dts);
                counter0 = int(readyCounter);
                ts0 = getCurrentTimeMillis();
            }
        });
        if (readyCounter+1000 < i)
            this_thread::sleep_for(10ms);
    }

    sem.wait();
    long dt = getCurrentTimeMillis() - t0;
    printf("total time = %li ms, rps = %li\n", dt, readyCounter*1000/dt);

    httpServer.stop();
    httpServer.join();
    printf("all done, stop server and client... ok\n");
}
