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
#include <queue>
#include "../network/mongoose/mongoose.h"
#include "../tools/ThreadPool.h"

namespace network {

class HttpClient;

class HttpClientWorker {
public:
    HttpClientWorker(int newId, HttpClient& parent);
    void sendGetRequest(const std::string& url, std::function<void(int,std::string&&)>&& callback);
    int getId() {return id_;}
private:
    int id_;
    HttpClient& parentRef_;
    ThreadPool worker_;
    std::shared_ptr<mg_mgr> mgr_;
    bool exitFlag_ = false;
    std::function<void(int,std::string&&)> callback_;
};

class HttpClient {

public:
    HttpClient(int poolSize);

    void sendGetRequest(const std::string& url, const std::function<void(int,std::string&&)>& callback);
    void sendGetRequest(const std::string& url, std::function<void(int,std::string&&)>&& callback);

private:
    std::shared_ptr<HttpClientWorker> getUnusedWorker();
    void releaseWorker(int workerId);
    friend HttpClientWorker;

private:
    std::queue<std::shared_ptr<HttpClientWorker>> pool_;
    std::mutex poolMutex_;
    std::condition_variable poolCV_;
    ThreadPool poolControlThread_;
    std::unordered_map<int, std::shared_ptr<HttpClientWorker>> usedWorkers_;

};

};

#endif //U8_HTTPCLIENT_H
