//
// Created by Leonid Novikov on 4/18/19.
//

#include "HttpClient.h"

namespace network {

HttpClient::HttpClient()
  : mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    mg_mgr_init(mgr_.get(), this);
}

void HttpClient::start() {
    clientThread_ = std::make_shared<std::thread>([this]() {
        while (!exitFlag_)
            mg_mgr_poll(mgr_.get(), 100);
    });
}

void HttpClient::stop() {
    exitFlag_ = true;
}

void HttpClient::join() {
    clientThread_->join();
}

void HttpClient::sendGetRequest(const std::string& url, const std::function<void(int,std::string&&)>& callback) {
    long reqId = saveCallback(callback);
    mg_connect_opts opts;
    memset(&opts, 0, sizeof(opts));
    opts.user_data = new std::pair<HttpClient*,long>(this, reqId);
    mg_connect_http_opt(mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
        if (ev == MG_EV_HTTP_REPLY) {
            auto pair = (std::pair<HttpClient*,long>*)nc->user_data;
            HttpClient* client = pair->first;
            long id = pair->second;
            http_message *hm = (http_message*)ev_data;
            auto callback = client->getCallback(id);
            callback(hm->resp_code, std::string(hm->body.p, hm->body.len));
            nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            delete pair;
            client->eraseCallback(id);
        }
    }, opts, url.c_str(), nullptr, nullptr);
}

long HttpClient::saveCallback(const std::function<void(int,std::string&&)>& callback) {
    std::lock_guard lock(mapMutex_);
    long reqId = nextReqId_;
    if (++nextReqId_ >= LONG_MAX)
        nextReqId_ = 1;
    reqCallbacks_[reqId] = callback;
    return reqId;
}

std::function<void(int,std::string&&)> HttpClient::getCallback(long reqId) {
    std::lock_guard lock(mapMutex_);
    return reqCallbacks_[reqId];
}

void HttpClient::eraseCallback(long reqId) {
    std::lock_guard lock(mapMutex_);
    reqCallbacks_.erase(reqId);
}

}
