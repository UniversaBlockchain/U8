//
// Created by Leonid Novikov on 4/18/19.
//

#ifndef U8_HTTPCLIENT_H
#define U8_HTTPCLIENT_H

#include <memory>
#include <thread>
#include <atomic>
#include <functional>
#include <unordered_map>
#include <mutex>
#include "../network/mongoose/mongoose.h"

namespace network {

class HttpClient {

public:
    HttpClient();

    void start();
    void stop();
    void join();

    void sendGetRequest(const std::string& url, const std::function<void(int,std::string&&)>& callback);

private:
    long saveCallback(const std::function<void(int,std::string&&)>& callback);
    std::function<void(int,std::string&&)> getCallback(long reqId);
    void eraseCallback(long reqId);

private:
    std::shared_ptr<mg_mgr> mgr_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<std::thread> clientThread_;

    std::atomic<long> nextReqId_ = 1;
    std::unordered_map<long, std::function<void(int,std::string&&)>> reqCallbacks_;
    std::mutex mapMutex_;

};

};

#endif //U8_HTTPCLIENT_H
