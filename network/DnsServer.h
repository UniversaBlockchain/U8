/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_DNSSERVER_H
#define U8_DNSSERVER_H

#include <memory>
#include <atomic>
#include <thread>
#include "mongoose/mongooseExt.h"

namespace network {

class DnsServer {
public:
    DnsServer();

    void start(const std::string& host, int port);
    void stop();
    void join();

private:
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* listener_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<std::thread> serverThread_;
};

}

#endif //U8_DNSSERVER_H
