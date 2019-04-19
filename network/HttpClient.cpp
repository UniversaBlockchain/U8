//
// Created by Leonid Novikov on 4/18/19.
//

#include "HttpClient.h"

namespace network {

std::function<void(int,std::string&&)> stub = [](int a,std::string&& b){};

HttpClientWorker::HttpClientWorker(int newId, HttpClient& parent)
  : id_(newId)
  , parentRef_(parent)
  , worker_(1)
  , mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;})
  , callback_(stub){
    mg_mgr_init(mgr_.get(), this);
};

void HttpClientWorker::sendGetRequest(const std::string& url, std::function<void(int,std::string&&)>&& callback) {
    callback_ = std::move(callback);
    worker_([this,url](){
        exitFlag_ = false;
        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = this;
        mg_connect_http_opt(mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpClientWorker* clientWorker = (HttpClientWorker*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                http_message *hm = (http_message*)ev_data;
                clientWorker->callback_(hm->resp_code, std::string(hm->body.p, hm->body.len));
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_CONNECT) {
                if (*(int *) ev_data != 0) {
                    clientWorker->exitFlag_ = true;
                }
            } else if (ev == MG_EV_CLOSE) {
                clientWorker->exitFlag_ = true;
            }
        }, opts, url.c_str(), nullptr, nullptr);
        while (!exitFlag_) {
            mg_mgr_poll(mgr_.get(), 100);
        }
        parentRef_.releaseWorker(id_);
    });
}

HttpClient::HttpClient()
  : poolControlThread_(1) {
    int poolSize = 10;
    for (int i = 0; i < poolSize; ++i) {
        std::shared_ptr<HttpClientWorker> client = make_shared<HttpClientWorker>(i,*this);
        pool_.push(client);
    }
}

std::shared_ptr<HttpClientWorker> HttpClient::getUnusedWorker() {
    std::unique_lock lock(poolMutex_);
    while (pool_.empty())
        poolCV_.wait(lock);
    auto client = pool_.front();
    pool_.pop();
    usedWorkers_[client->getId()] = client;
    return client;
}

void HttpClient::releaseWorker(int workerId) {
    std::lock_guard guard(poolMutex_);
    pool_.push(usedWorkers_[workerId]);
    usedWorkers_.erase(workerId);
    poolCV_.notify_one();
}

void HttpClient::sendGetRequest(const std::string& url, const std::function<void(int,std::string&&)>& callback) {
    std::function<void(int,std::string&&)> callbackCopy = callback;
    sendGetRequest(url, std::move(callbackCopy));
}

void HttpClient::sendGetRequest(const std::string& url, std::function<void(int,std::string&&)>&& callback) {
    poolControlThread_.execute([callback{std::move(callback)}, url, this]() mutable {
        auto client = getUnusedWorker();
        client->sendGetRequest(url, std::move(callback));
    });
}

}
