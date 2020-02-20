/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "DnsServer.h"

namespace network {

DnsServerQuestion::DnsServerQuestion(long qId, std::shared_ptr<mg_mgr> mgr, mg_connection* con, mg_dns_message *msg, mg_dns_resource_record rr) {
    questionId_ = qId;
    mgr_ = mgr;
    con_ = con;
    rr_ = rr;
    mbuf_init(&replyBuf_, 512);
    reply_ = mg_dns_create_reply(&replyBuf_, msg);
}

void DnsServerQuestion::sendAnswerFromMgThread() {
    auto ans = inet_addr("127.0.0.1");
    mg_dns_reply_record(&reply_, &rr_, NULL, rr_.rtype, 10, &ans, sizeof(ans));
    mg_dns_send_reply(con_, &reply_);


    //todo: free
    mbuf_free(&replyBuf_);
}

DnsServer::DnsServer(): mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    mg_mgr_init(mgr_.get(), this);
}

void DnsServer::start(const std::string& host, int port) {
    std::string addr = "udp://" + host + ":" + std::to_string(port);
    listener_ = mg_bind(mgr_.get(), addr.data(), [](mg_connection *nc, int ev, void *ev_data){
        DnsServer* server = (DnsServer*)nc->mgr->user_data;
        switch (ev) {
            case MG_DNS_MESSAGE: {
                mg_dns_message *msg = (mg_dns_message*) ev_data;
                for (int i = 0; i < msg->num_questions; ++i) {
                    mg_dns_resource_record* rr = &msg->questions[i];

                    long qId = server->genQuestionId();
                    auto dnsQuestion = std::make_shared<DnsServerQuestion>(qId, server->mgr_, nc, msg, *rr);
                    server->questionsHolder_[qId] = dnsQuestion;

                    char rname[256];
                    memset(rname, 0, sizeof(rname));
                    mg_dns_uncompress_name(msg, &rr->name, rname, sizeof(rname) - 1);

                    dnsQuestion->name = rname;
                    dnsQuestion->rtype = rr->rtype;
                    dnsQuestion->rclass = rr->rclass;
                    dnsQuestion->ttl = rr->ttl;

                    server->onQuestionCallback_(dnsQuestion);
                }

                //nc->flags |= MG_F_SEND_AND_CLOSE;
                break;
            }
        }
    });

    if (listener_ == nullptr)
        throw std::runtime_error("Failed to create DNS listener");

    mg_set_protocol_dns(listener_);

    serverThread_ = std::make_shared<std::thread>([this]() {
        while (!exitFlag_)
            mg_mgr_poll(mgr_.get(), 100);
        mgr_.reset();
    });
}

void DnsServer::stop() {
    exitFlag_ = true;
}

void DnsServer::join() {
    serverThread_->join();
}

long DnsServer::genQuestionId() {
    long qId = nextQuestionId_++;
    if (nextQuestionId_ >= 2000000000)
        nextQuestionId_ = 1;
    return qId;
}

void DnsServer::setQuestionsCallback(std::function<void(std::shared_ptr<DnsServerQuestion>)>&& onQuestion) {
    onQuestionCallback_ = std::move(onQuestion);
}

}
