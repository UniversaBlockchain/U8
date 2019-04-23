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
#include "../network/mongoose/mongoose.h"
#include "../tools/tools.h"
#include "../tools/ThreadPool.h"

namespace network {

class HttpServerRequest {
public:
    HttpServerRequest() {}
    HttpServerRequest(mg_connection* con, http_message *hm, std::shared_ptr<mg_mgr> mgr);
public:
    void setStatusCode(int code);
    void setHeader(const std::string& key, const std::string& value);
    void setAnswerBody(const byte_vector& bytes);
    void setAnswerBody(byte_vector&& bytes);
    void setAnswerBody(const std::string& text);
    void sendAnswerFromAnotherThread();
    void sendAnswer();
protected:
    mg_connection* con_;
    http_message* msg_;
    std::shared_ptr<mg_mgr> mgr_;
    int statusCode_ = 200;
    std::unordered_map<std::string, std::string> extHeaders_;
    byte_vector answerBody_;
};

class HttpServer {

public:
    HttpServer(std::string host, int port, int poolSize);

    void start();
    void stop();
    void join();

    void addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest&)>& callback);
    void addSecureEndpoint();

private:
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* listener_;
    std::unordered_map<std::string, std::function<void(HttpServerRequest&)>> routes_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<std::thread> serverThread_;
    ThreadPool receivePool_;
};

}

#endif //U8_HTTPSERVER_H
