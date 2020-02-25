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
#include "../tools/tools.h"

namespace network {

enum DnsRRType {
    DNS_A = MG_DNS_A_RECORD,
    DNS_AAAA = MG_DNS_AAAA_RECORD,
    DNS_CNAME = MG_DNS_CNAME_RECORD,
    DNS_TXT = 16,
    DNS_NS = 2,
    DNS_SOA = 6,
};

class DnsResolverAnswer {
public:
    DnsResolverAnswer(byte_vector&& bin, mg_dns_message* msg, int ansIndex, int rtype);
    int getType() const;
    const byte_vector& getBinary() const;
    std::string parseIpV4asString() const;
    std::string parseIpV6asString() const;
    std::string parseCNAME() const;
    std::string parseTXT() const;
private:
    byte_vector bin_;
    byte_vector msgBody_;
    int ansIndex_;
    int rtype_;
};

struct DnsResolverRequestHolder {
    long resolverId;
    long reqId;
    std::function<void(const std::vector<DnsResolverAnswer>& ansArr)> callback;
};

class DnsResolver {
public:
    DnsResolver();

    void setNameServer(const std::string& nameServer, int port = 53);
    void start();
    void stop();
    void join();

    void resolve(const std::string& name, int query, std::function<void(const std::vector<DnsResolverAnswer>& ansArr)>&& onComplete);

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
    DnsServerQuestion(long srvId, long qId, std::shared_ptr<mg_mgr> mgr, mg_connection* con, mg_dns_message* msg, int qIndx);

public:
    std::string name;
    int rtype;
    int rclass;
    int ttl;

    bool addAnswerIpV4(const std::string& ip);
    bool addAnswerIpV6(const std::string& ip6);
    bool addAnswerBin(const byte_vector& bin);
    void sendAnswer(int ttl);
    void sendAnswerFromMgThread(int ans_ttl);

private:
    long serverId_;
    long questionId_;
    long connId_;
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* con_;
    std::vector<byte_vector> ansBinary_;
    byte_vector msgBody_;
    int questionIndex_;
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
    long nextConId_ = 1;
    std::shared_ptr<mg_mgr> mgr_;
    mg_connection* listener_;
    std::atomic<bool> exitFlag_ = false;
    std::mutex broadcastMutex_;
    std::shared_ptr<std::thread> serverThread_;
    std::atomic<long> nextQuestionId_ = 1;
    std::unordered_map<long, std::shared_ptr<DnsServerQuestion>> questionsHolder_;
    std::function<void(std::shared_ptr<DnsServerQuestion>)> onQuestionCallback_;
    std::thread::id mgThreadId_;
};

}

#endif //U8_DNSSERVER_H
