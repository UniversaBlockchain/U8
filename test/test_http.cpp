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
#include "../crypto/base64.h"
#include "../serialization/BossSerializer.h"

using namespace std;
using namespace network;

TEST_CASE("http_hello") {
    HttpServer httpServer("0.0.0.0", 8080, 4);
    atomic<int> counter(0);
    crypto::PrivateKey privateKey(4096);
    crypto::PublicKey publicKey(privateKey);
    httpServer.addEndpoint("/testPage", [&counter,&publicKey](HttpServerRequest* request){
        request->setHeader("Server", "Universa node");
        string answer("testPage answer #"+to_string(++counter));
        byte_vector bv(answer.begin(), answer.end());
        request->setAnswerBody(answer + ", encrypted: " + base64_encode(publicKey.encrypt(bv)));
        request->sendAnswerFromAnotherThread();
    });
    auto secureProcessor = [](UBinder& params){
        std::string command = params.getString("command");
        printf("command: %s\n", command.c_str());
        if (command == "hello") {
            return UBinder::of("result", UBinder::of("status", "OK", "message", "welcome to the Universa"));
        } else if (command == "sping") {
            return UBinder::of("result", UBinder::of("sping", "spong"));
        } else if (command == "test_error") {
            throw std::invalid_argument("sample error");
        } else {
            if (command == "setVerbose") {
                printf("secureEndpoint: setVerbose\n");
                return UBinder::of("result", UBinder::of("itemResult", "setVerbose not implemented in cpp tests"));
            } else
                throw std::invalid_argument("unknown command: " + command);
        }
    };
    ThreadPool poolForSecureCallbacks(4);
    httpServer.addSecureCallback([&secureProcessor,&poolForSecureCallbacks](
            const byte_vector& paramsBin,
            std::shared_ptr<HttpServerSession> session,
            std::function<void(const byte_vector& ansBin)>&& sendAnswer){
        poolForSecureCallbacks.execute([paramsBin,&secureProcessor,sendAnswer{std::move(sendAnswer)}](){
            byte_vector paramsCopy(paramsBin);
            UObject paramsUnpackedObj = BossSerializer::deserialize(UBytes(std::move(paramsCopy)));
            UBinder params = UBinder::asInstance(paramsUnpackedObj);
            UBinder reqAns = secureProcessor(params);
            sendAnswer(BossSerializer::serialize(reqAns).get());
        });
    });
    httpServer.start();

    HttpClient httpClient(20);

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
