/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "DnsServer.h"

namespace network {

DnsServer::DnsServer(): mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    mg_mgr_init(mgr_.get(), this);
}

void DnsServer::start(const std::string& host, int port) {
    std::string addr = "udp://" + host + ":" + std::to_string(port);
    listener_ = mg_bind(mgr_.get(), addr.data(), [](struct mg_connection *nc, int ev, void *ev_data){
        switch (ev) {
            case MG_DNS_MESSAGE: {
                mg_dns_message *msg = (mg_dns_message*) ev_data;
                printf("dns query...\n");
                for (int i = 0; i < msg->num_questions; ++i) {
                    std::string rname;
                    rname.reserve(256);
                    memset(&rname[0], 0, rname.capacity());
                    mg_dns_resource_record* rr = &msg->questions[i];
                    mg_dns_uncompress_name(msg, &rr->name, &rname[0], (int)rname.capacity()-1);
                    printf("  dns query (type=%i): %s\n", rr->rtype, rname.data());
                    if (rr->rtype == MG_DNS_A_RECORD) {
                        mg_dns_reply reply;
                        mbuf replyBuf;
                        mbuf_init(&replyBuf, 512);
                        reply = mg_dns_create_reply(&replyBuf, msg);
                        auto ans = inet_addr("127.0.0.1");
                        mg_dns_reply_record(&reply, rr, NULL, rr->rtype, 10, &ans, 4);
                        mg_dns_send_reply(nc, &reply);
                        mbuf_free(&replyBuf);
                    }
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

}
