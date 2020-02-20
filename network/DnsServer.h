/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_DNSSERVER_H
#define U8_DNSSERVER_H

#include <memory>
#include <atomic>
#include <thread>
#include <unordered_map>
#include <functional>
#include <mutex>
#include <list>
#include "mongoose/mongooseExt.h"

namespace network {

struct DnsResolverRequestHolder {
    long resolverId;
    long reqId;
    std::function<void(const std::string& ip)> callback;
};

class DnsResolver {
public:
    DnsResolver();

    void setNameServer(const std::string& nameServer, int port = 53);
    void start();
    void stop();
    void join();

    void resolve(const std::string& name, int query, std::function<void(const std::string& ip)>&& onComplete);

private:
    DnsResolverRequestHolder* saveReq(DnsResolverRequestHolder&& req);
    void removeReq(long reqId);

private:
    long ownId_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<mg_mgr> mgr_;
    std::shared_ptr<std::thread> pollThread_;
    std::mutex reqsBufMutex_;
    std::atomic<int> activeReqsCount_ = 0;
    std::list<std::function<void()>> reqsBuf_;
    std::atomic<long> nextReqId_ = 1;
    std::mutex reqsMutex_;
    std::unordered_map<long, DnsResolverRequestHolder> reqs_;

    std::string nameServerHost_;
    int nameServerPort_;
    int pollPeriodMillis_ = 5;
    int requestTimeoutMillis_ = 4000;
};

class DnsServerQuestion {
public:
    DnsServerQuestion(long srvId, long qId, std::shared_ptr<mg_mgr> mgr, mg_connection* con, mg_dns_message *msg, mg_dns_resource_record rr);

public:
    std::string name;
    int rtype;
    int rclass;
    int ttl;

    void sendAnswerFromMgThread();

private:
    long serverId_;
    long questionId_;
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* con_;
    mg_dns_reply reply_;
    mbuf replyBuf_;
    mg_dns_resource_record rr_;
};

class DnsServer {
public:
    DnsServer();

    void start(const std::string& host, int port);
    void stop();
    void join();

    void setQuestionsCallback(std::function<void(std::shared_ptr<DnsServerQuestion>)>&& onQuestion);

    long genQuestionId();

private:
    friend DnsServerQuestion;

private:
    long ownId_;
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* listener_;
    std::atomic<bool> exitFlag_ = false;
    std::shared_ptr<std::thread> serverThread_;
    std::atomic<long> nextQuestionId_ = 1;
    std::unordered_map<long, std::shared_ptr<DnsServerQuestion>> questionsHolder_;
    std::function<void(std::shared_ptr<DnsServerQuestion>)> onQuestionCallback_;
};

}

#endif //U8_DNSSERVER_H
