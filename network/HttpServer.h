//
// Created by Leonid Novikov on 4/17/19.
//

#ifndef U8_HTTPSERVER_H
#define U8_HTTPSERVER_H

#include <memory>
#include <string>
#include <unordered_map>
#include <functional>
#include <atomic>
#include <random>
#include "../network/mongoose/mongoose.h"
#include "../tools/tools.h"
#include "../tools/ThreadPool.h"
#include "../types/UBinder.h"
#include "../crypto/SymmetricKey.h"
#include "../crypto/PublicKey.h"

namespace network {

class HttpServerRequest {
public:
    HttpServerRequest() {}
    HttpServerRequest(mg_connection* con, http_message *hm, std::shared_ptr<mg_mgr> mgr, std::string endpoint);
public:
    void setStatusCode(int code);
    void setHeader(const std::string& key, const std::string& value);
    void setAnswerBody(const byte_vector& bytes);
    void setAnswerBody(byte_vector&& bytes);
    void setAnswerBody(const std::string& text);
    void sendAnswerFromAnotherThread();
    void sendAnswer();
    std::string getEndpoint() {return endpoint_;}
    std::string getQueryString();
    std::string getMethod();
    byte_vector getRequestBody();
    std::unordered_map<std::string, byte_vector> parseMultipartData();
protected:
    mg_connection* con_;
    std::string queryString_;
    std::string method_;
    byte_vector body_;
    std::shared_ptr<mg_mgr> mgr_;
    int statusCode_ = 200;
    std::unordered_map<std::string, std::string> extHeaders_;
    byte_vector answerBody_;
    std::string endpoint_;
};

// encapsulates mongoose web server
class HttpService {

public:
    HttpService(std::string host, int port, int poolSize);

    void start();
    void stop();
    void join();

    void addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest*)>& callback);

private:
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* listener_;
    std::unordered_map<std::string, std::function<void(HttpServerRequest*)>> routes_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<std::thread> serverThread_;
    ThreadPool receivePool_;
};

class HttpServerSession {
public:
    HttpServerSession(const crypto::PublicKey& key): publicKey(key) {}
    HttpServerSession(const HttpServerSession& copyFrom) = default;
    HttpServerSession(HttpServerSession&& moveFrom) = default;
    HttpServerSession& operator= (const HttpServerSession& copyFrom) = default;
    HttpServerSession& operator= (HttpServerSession&& moveFrom) = default;
    crypto::PublicKey publicKey;
    std::shared_ptr<crypto::SymmetricKey> sessionKey;
    byte_vector serverNonce;
    byte_vector encryptedAnswer;
    long sessionId;
    std::mutex connectMutex;
};

class HttpServer {

public:
    HttpServer(std::string host, int port, int poolSize);

    void start();
    void stop();
    void join();

    void addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest*)>& callback);
    void addEndpoint(const std::string& endpoint, std::function<void(HttpServerRequest*)>&& callback);
    void addSecureCallback(const std::function<void(const byte_vector& params,
            std::function<void(const byte_vector& ansBin)>&&)>& callback);
    void addSecureCallback(std::function<void(const byte_vector& params,
            std::function<void(const byte_vector& ansBin)>&&)>&& callback);

private:
    UBinder extractParams(std::unordered_map<std::string, byte_vector>& reqParams);
    void initSecureProtocol();
    void inSession(HttpServerRequest *req, std::function<void(byte_vector& params,
            std::function<void(const byte_vector& ansBin)>&& sendAnswer)>&& processor);
    std::shared_ptr<HttpServerSession> getSession(crypto::PublicKey& key);
    std::shared_ptr<HttpServerSession> getSession(long sessionId);

private:
    crypto::PrivateKey myKey_;
    HttpService service_;
    std::mutex mutexSessions_;
    std::unordered_map<std::string, std::shared_ptr<HttpServerSession>> sessionsByKey_;
    std::unordered_map<long, std::shared_ptr<HttpServerSession>> sessionsById_;
    std::minstd_rand minstdRand_;
    long nextSessionId_;
    std::function<void(const byte_vector& params, std::function<void(const byte_vector& ansBin)>&&)> secureCallback_;

};

}

#endif //U8_HTTPSERVER_H
