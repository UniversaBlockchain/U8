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

TEST_CASE("BossSerializer_exceptions") {
    crypto::PrivateKey privateKey(2048);
    crypto::PublicKey publicKey(privateKey);
    for (int i = 0; i < 1000; ++i) {
        try {
            //cout << "i=" << i << endl;
            byte_vector se = BossSerializer::serialize(
                    UBinder::of("client_keyclient_keyclient_key", UBytes(crypto::PublicKey(publicKey).pack()))).get();
            sprng_read(&se[0], se.size(), NULL);
            byte_vector de = UBytes::asInstance(
                    UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(se)))).get(
                            "client_keyclient_keyclient_key")).get();
        } catch (const std::exception &e) {
            // do nothing, wait for sigsegv
        }
    }
}

TEST_CASE("http_hello") {
    crypto::PrivateKey nodePrivateKey(base64_decodeToBytes("JgAcAQABvIDhlmN5xUJsTxP6sFA4fSKHYKB0e7Sh4m/X+siqL7/uP8f6ZAqWr5GpzGW9NSYZP64KeU7pXiTSOUy2/4ONKjqrQ+UWtww2vElpQFyUqlJGh9JKqA2VwZtwEPJxbL/zTJqyW9nXoR8G0Np2/poYtKEydGJlL8QimYTk4WtpI64y7byAuwpRoTxc6LbWoCl6Mz0eaLKMn5JgEuKHn3TJ/Hi62nmhfi9NYluAweMjXYgxaxdNKl5N4IOeL8b0vO/fAVVIfmKKJkq9kAMiRHmOSc4LS15Y1WrTkCSz20wKQMbPFsRzddm9Ml4XD0zCxJi5Bzz2AO1Slo3y2+fkA8CkSjZ3wEs="));
    crypto::PublicKey nodePublicKey(nodePrivateKey);
    HttpServer httpServer("0.0.0.0", 8080, 4);
    atomic<int> counter(0);
    crypto::PrivateKey privateKey(4096);
    crypto::PublicKey publicKey(privateKey);
    httpServer.addEndpoint("/testPage", [&counter,&publicKey](HttpServerRequest* request){
//        byte_vector bv0 = request->getRequestBody();
//        string sbody(bv0.begin(), bv0.end());
//        cout << sbody << endl;
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
            } else if (command == "unsRate") {
                return UBinder::of("result", UBinder::of("U", 777));
            }else
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

    HttpClient httpClient("http://localhost:8080", 20);
    httpClient.start(crypto::PrivateKey(2048), nodePublicKey);

    Semaphore sem;
    atomic<int> readyCounter(0);
    //int countToSend = 200000000;
    int countToSend = 2000;

    atomic<long> ts0 = getCurrentTimeMillis();
    atomic<int> counter0 = 0;

    long t0 = getCurrentTimeMillis();
    for (int i = 0; i < countToSend; ++i) {
        httpClient.sendGetRequest("localhost:8080/testPage", [&sem,&readyCounter,countToSend,&ts0,&counter0](int respCode, byte_vector&& body){
//            string bodyStr(body.begin(), body.end());
//            printf("resp(%i): %s\n", respCode, bodyStr.c_str());
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

TEST_CASE("http_secure_endpoints") {
    crypto::PrivateKey nodePrivateKey(base64_decodeToBytes("JgAcAQABvID6D5ZdM9EKrZSztm/R/RcywM4K8Z4VBtX+NZp2eLCWtfAgGcBCQLtNz4scH7dPBerkkxckW6+9CLlnu/tgOxvzS6Z1Ec51++fVP9gaWbBQe9/dSg7xVPg5p9ibhfTB+iRXyevCkNj0hrlLyXl1BkPjN9+lZfXJsp9OnGIJ/AaAb7yA99E65gvZnbb3/oA3rG0pM45af6ppZKe2HeiAK+fcXm5KTQzfTce45f/mJ0jsDmFf1HFosS4waXSAz0ZfcssjPeoF3PuXfJLtM8czJ55+Nz6NMCbzrSk6zkKssGBieYFOb4eG2AdtfjTrpcSSHBgJpsbcmRx4bZNfBAZPqT+Sd20="));
    crypto::PublicKey nodePublicKey(nodePrivateKey);
    HttpServer httpServer("0.0.0.0", 8080, 4);
    httpServer.initSecureProtocol(nodePrivateKey);
    auto secureProcessor = [](UBinder& params){
        std::string command = params.getString("command");
        if (command == "hello") {
            return UBinder::of("result", UBinder::of("status", "OK", "message", "welcome to the Universa"));
        } else if (command == "sping") {
            return UBinder::of("result", UBinder::of("sping", "spong"));
        } else if (command == "test_error") {
            throw std::invalid_argument("sample error");
        } else {
            if (command == "unsRate") {
                return UBinder::of("result", UBinder::of("U", 777));
            }else
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

    vector<shared_ptr<HttpClient>> clients;
    for (int i = 0; i < 10; ++i) {
        shared_ptr<HttpClient> httpClient = make_shared<HttpClient>("http://localhost:8080", 4);
        //shared_ptr<HttpClient> httpClient = make_shared<HttpClient>("http://192.168.1.146:8080", 4);
        httpClient->start(crypto::PrivateKey(2048), nodePublicKey);
        clients.emplace_back(httpClient);
    }

    Semaphore sem;
    atomic<int> readyCounter(0);
    //int countToSend = 200000000;
    int countToSend = 2000;

    atomic<long> ts0 = getCurrentTimeMillis();
    atomic<int> counter0 = 0;

    auto onComplete = [&sem,&readyCounter,countToSend,&ts0,&counter0](UBinder&& resp){
//        long U = resp.getInt("U");
//        printf("resp: U=%li\n", U);
        if (++readyCounter >= countToSend)
            sem.notify();
        long dts = getCurrentTimeMillis() - ts0;
        if (dts >= 1000) {
            printf("readyCounter=%i, rps=%li\n", int(readyCounter), (readyCounter-counter0)*1000/dts);
            counter0 = int(readyCounter);
            ts0 = getCurrentTimeMillis();
        }
    };

    long t0 = getCurrentTimeMillis();
    for (int i = 0; i < countToSend; ++i) {
        auto c = clients[i % clients.size()];
        c->command("unsRate", UBinder(), onComplete);
        if (i-readyCounter > 1000)
            this_thread::sleep_for(10ms);
    }

    sem.wait();
    long dt = getCurrentTimeMillis() - t0;
    printf("total time = %li ms, rps = %li\n", dt, readyCounter*1000/dt);

    httpServer.stop();
    httpServer.join();
    printf("all done, stop server and client... ok\n");
}
