//
// Created by Leonid Novikov on 4/17/19.
//

#include <thread>
#include "HttpServer.h"

namespace network {

HttpServerRequest::HttpServerRequest(mg_connection* con, http_message *hm) {
    con_ = con;
    msg_ = hm;
    extHeaders_["Content-Type"] = "text/plain";
    extHeaders_["Connection"] = "close";
}


void HttpServerRequest::setStatusCode(int code) {
    statusCode_ = code;
}

void HttpServerRequest::setHeader(const std::string& key, const std::string& value) {
    extHeaders_[key] = value;
}

void HttpServerRequest::setAnswerBody(const byte_vector& bytes) {
    answerBody_ = bytes;
}

void HttpServerRequest::setAnswerBody(byte_vector&& bytes) {
    answerBody_ = std::move(bytes);
}

void HttpServerRequest::setAnswerBody(const std::string& text) {
    setAnswerBody(byte_vector(text.begin(), text.end()));
}

void HttpServerRequest::sendAnswer() {
    std::string extHeaders;
    if (extHeaders_.size() > 0) {
        int count = 0;
        for (auto &k : extHeaders_) {
            extHeaders += k.first + ": " + k.second;
            if (++count < extHeaders_.size())
                extHeaders += "\r\n";
        }
    }
    mg_send_head(con_, statusCode_, answerBody_.size(), extHeaders.c_str());
    mg_send(con_, &answerBody_[0], answerBody_.size());
    con_->flags |= MG_F_SEND_AND_CLOSE;
}

HttpServer::HttpServer(std::string host, int port)
  : mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    mg_mgr_init(mgr_.get(), this);
    std::string addr = host + ":" + std::to_string(port);
    listener_ = mg_bind(mgr_.get(), addr.c_str(), [](mg_connection *nc, int ev, void *ev_data){
        if (ev == MG_EV_HTTP_REQUEST) {
            HttpServer* server = (HttpServer*)nc->mgr->user_data;
            http_message* hm = (http_message*)ev_data;
            std::string strUri = std::string(hm->uri.p, hm->uri.len);
            if (server->routes_.find(strUri) != server->routes_.end()) {
                HttpServerRequest request(nc, hm);
                server->routes_[strUri](request);
            } else {
                mg_http_send_error(nc, 404, nullptr);
            }
        }
    });
    if (listener_ == nullptr)
        throw std::runtime_error("Failed to create listener");
    mg_set_protocol_http_websocket(listener_);
}

void HttpServer::start() {
    serverThread_ = std::make_shared<std::thread>([this]() {
        while (!exitFlag_)
            mg_mgr_poll(mgr_.get(), 100);
    });
}

void HttpServer::stop() {
    exitFlag_ = true;
}

void HttpServer::join() {
    serverThread_->join();
}

void HttpServer::addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest&)>& callback) {
    routes_[endpoint] = callback;
}

void HttpServer::addSecureEndpoint() {
    throw std::runtime_error("addSecureEndpoint not implemented");
}

}