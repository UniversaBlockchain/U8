/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "DnsServer.h"

namespace network {

std::mutex serversNextIdMutex_g;
long serversNextId_g = 1;
std::mutex resolversHolderMutex_g;
std::mutex serversHolderMutex_g;
std::unordered_map<long, DnsResolver*> resolversHolder_g;
std::unordered_map<long, DnsServer*> serversHolder_g;

long genNextServerId_g() {
    std::lock_guard lock(serversNextIdMutex_g);
    long res = serversNextId_g;
    ++serversNextId_g;
    if (serversNextId_g >= 2000000000)
        serversNextId_g = 1;
    return res;
}

void addServer_g(long serverId, DnsServer* srv) {
    std::lock_guard lock(serversHolderMutex_g);
    serversHolder_g[serverId] = srv;
}

DnsServer* getServer_g(long serverId) {
    std::lock_guard lock(serversHolderMutex_g);
    if (serversHolder_g.find(serverId) == serversHolder_g.end())
        return nullptr;
    return serversHolder_g[serverId];
}

void removeServer_g(long serverId) {
    std::lock_guard lock(serversHolderMutex_g);
    serversHolder_g.erase(serverId);
}

void addResolver_g(long resolverId, DnsResolver* rs) {
    std::lock_guard lock(resolversHolderMutex_g);
    resolversHolder_g[resolverId] = rs;
}

DnsResolver* getResolver_g(long resolverId) {
    std::lock_guard lock(resolversHolderMutex_g);
    if (resolversHolder_g.find(resolverId) == resolversHolder_g.end())
        return nullptr;
    return resolversHolder_g[resolverId];
}

void removeResolver_g(long resolverId) {
    std::lock_guard lock(resolversHolderMutex_g);
    resolversHolder_g.erase(resolverId);
}

DnsResolver::DnsResolver(): mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    mg_mgr_init(mgr_.get(), this);
    ownId_ = genNextServerId_g();
    addResolver_g(ownId_, this);
}

void DnsResolver::setNameServer(const std::string& nameServer, int port) {
    nameServerHost_ = nameServer;
    nameServerPort_ = port;
}

void DnsResolver::start() {
    pollThread_ = std::make_shared<std::thread>([this](){
        while (!exitFlag_) {
            {
                std::lock_guard lock(reqsBufMutex_);
                while (!reqsBuf_.empty() && activeReqsCount_ < 20) {
                    auto& reqFunc = reqsBuf_.front();
                    reqFunc();
                    reqsBuf_.pop_front();
                    ++activeReqsCount_;
                }
            }
            mg_mgr_poll(mgr_.get(), pollPeriodMillis_);
        }
    });
}

void DnsResolver::stop() {
    exitFlag_ = true;
}

void DnsResolver::join() {
    pollThread_->join();
    removeResolver_g(ownId_);
}

void DnsResolver::resolve(const std::string& name, int query, std::function<void(const std::string& ip)>&& onComplete) {
    DnsResolverRequestHolder holder;
    holder.resolverId = ownId_;
    holder.callback = std::move(onComplete);
    DnsResolverRequestHolder* pholder = saveReq(std::move(holder));
    std::lock_guard lock(reqsBufMutex_);
    reqsBuf_.emplace_back([this,name,query,pholder](){
        mg_resolve_async_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.nameserver = &nameServerHost_[0];
        mg_resolve_async_opt(mgr_.get(), name.data(), query, [](mg_dns_message *msg, void *user_data, enum mg_resolve_err){
            if (msg == nullptr)
                return;
            DnsResolverRequestHolder* ph = (DnsResolverRequestHolder*) user_data;
            for (int i = 0; i < msg->num_answers; ++i) {
                mg_dns_resource_record* rr = &msg->answers[i];
                switch (rr->rtype) {
                    case DnsRRType::DNS_A: {
                        in_addr got_addr;
                        mg_dns_parse_record_data(msg, rr, &got_addr, sizeof(got_addr));
                        char resolvedIp[INET_ADDRSTRLEN];
                        memset(resolvedIp, 0, sizeof(resolvedIp));
                        inet_ntop(AF_INET, &got_addr, resolvedIp, sizeof(resolvedIp));
                        ph->callback(std::string(resolvedIp));
                        break;
                    }
                    case DnsRRType::DNS_AAAA: {
                        in6_addr got_addr;
                        mg_dns_parse_record_data(msg, rr, &got_addr, sizeof(got_addr));
                        char resolvedIp[INET6_ADDRSTRLEN];
                        memset(resolvedIp, 0, sizeof(resolvedIp));
                        inet_ntop(AF_INET6, &got_addr, resolvedIp, sizeof(resolvedIp));
                        ph->callback(std::string(resolvedIp));
                        break;
                    }
                    default: {
                        printf("resolved: N/A, rtype=%i\n", rr->rtype);
                        break;
                    }
                }
            }

            DnsResolver* pSelf = getResolver_g(ph->resolverId);
            if (pSelf != nullptr)
                pSelf->removeReq(ph->reqId);
            --pSelf->activeReqsCount_;
        }, pholder, opts, nameServerPort_);
    });
}

DnsResolverRequestHolder* DnsResolver::saveReq(DnsResolverRequestHolder&& req) {
    long reqId = nextReqId_;
    req.reqId = reqId;
    std::lock_guard lock(reqsMutex_);
    reqs_[reqId] = std::move(req);
    ++nextReqId_;
    if (nextReqId_ >= LONG_MAX)
        nextReqId_ = 1;
    return &reqs_[reqId];
}

void DnsResolver::removeReq(long reqId) {
    std::lock_guard lock(reqsMutex_);
    reqs_.erase(reqId);
}

DnsServerQuestion::DnsServerQuestion(long srvId, long qId, std::shared_ptr<mg_mgr> mgr, mg_connection* con, mg_dns_message *msg, int qIndx) {
    serverId_ = srvId;
    questionId_ = qId;
    connId_ = (long)con->user_data;
    mgr_ = mgr;
    con_ = con;
    msgBody_.resize(msg->pkt.len);
    memcpy(&msgBody_[0], msg->pkt.p, msg->pkt.len);
    questionIndex_ = qIndx;
}

bool DnsServerQuestion::addAnswerIpV4(const std::string& ip) {
    in_addr ans;
    if (inet_pton(AF_INET, ip.data(), &ans) > 0) {
        byte_vector bin;
        bin.resize(sizeof(ans));
        memcpy(&bin[0], &ans, sizeof(ans));
        ansBinary_.emplace_back(std::move(bin));
        return true;
    }
    return false;
}

bool DnsServerQuestion::addAnswerIpV6(const std::string& ip6) {
    in6_addr ans;
    if (inet_pton(AF_INET6, ip6.data(), &ans) > 0) {
        byte_vector bin;
        bin.resize(sizeof(ans));
        memcpy(&bin[0], &ans, sizeof(ans));
        ansBinary_.emplace_back(std::move(bin));
        return true;
    }
    return false;
}

bool DnsServerQuestion::addAnswerBin(const byte_vector& bin) {
    if (bin.size() <= 512) {
        ansBinary_.emplace_back(bin);
        return true;
    }
    return false;
}

struct DnsServerAnswerHolder {
    long serverId;
    long qId;
    mg_connection *nc;
    int ttl;
    long connId;
    bool done;
};

void DnsServerQuestion::sendAnswer(int ttl) {
    DnsServer* server = getServer_g(serverId_);
    if (server == nullptr)
        return;
    if (std::this_thread::get_id() == server->mgThreadId_) {
        sendAnswerFromMgThread(ttl);
        return;
    }
    DnsServerAnswerHolder ah;
    ah.serverId = serverId_;
    ah.qId = questionId_;
    ah.nc = con_;
    ah.ttl = ttl;
    ah.connId = connId_;
    ah.done = false;
    std::lock_guard lock(server->broadcastMutex_);
    mg_broadcast(server->mgr_.get(), [](mg_connection *nc, int ev, void *ev_data) {
        DnsServerAnswerHolder* holder = (DnsServerAnswerHolder*)ev_data;
        if (holder->done)
            return;
        long serverId = holder->serverId;
        DnsServer* server = getServer_g(serverId);
        if (server == nullptr)
            return;
        if ((long)nc->user_data == holder->connId) {
            // here we are in mongoose loop thread, so we dont worry about synchronization
            if (server->questionsHolder_.find(holder->qId) != server->questionsHolder_.end()) {
                auto pReq = server->questionsHolder_[holder->qId];
                pReq->sendAnswerFromMgThread(holder->ttl);
                holder->done = true;
            }
        }
    }, (void*)(&ah), sizeof(ah));
}

void DnsServerQuestion::sendAnswerFromMgThread(int ans_ttl) {
    DnsServer* server = getServer_g(serverId_);
    if (server == nullptr)
        return;

    mg_dns_message msg;
    // this body has been already successfully parsed, so we can to ignore error code here
    mg_parse_dns((char*)&msgBody_[0], msgBody_.size(), &msg);

    mg_dns_resource_record* rr = &msg.questions[questionIndex_];

    mbuf replyBuf;
    mbuf_init(&replyBuf, 512);
    mg_dns_reply reply = mg_dns_create_reply(&replyBuf, &msg);

    for (byte_vector& bv : ansBinary_)
        mg_dns_reply_record(&reply, rr, nullptr, rr->rtype, ans_ttl, &bv[0], bv.size());
    mg_dns_send_reply(con_, &reply);

    con_->flags |= MG_F_SEND_AND_CLOSE;

    mbuf_free(&replyBuf);
    server->questionsHolder_.erase(questionId_);
}

DnsServer::DnsServer(): mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;}) {
    ownId_ = genNextServerId_g();
    addServer_g(ownId_, this);
    mg_mgr_init(mgr_.get(), (void*)ownId_);
}

void DnsServer::start(const std::string& host, int port) {
    std::string addr = "udp://" + host + ":" + std::to_string(port);
    listener_ = mg_bind(mgr_.get(), addr.data(), [](mg_connection *nc, int ev, void *ev_data){
        long serverId = (long)nc->mgr->user_data;
        DnsServer* server = getServer_g(serverId);
        if (server == nullptr)
            return;
        switch (ev) {
            case MG_EV_ACCEPT: {
                nc->user_data = (void*) server->nextConId_++;
                if (server->nextConId_ >= 2000000000)
                    server->nextConId_ = 1;
                break;
            }

            case MG_EV_CLOSE: {
                nc->user_data = nullptr;
                break;
            }

            case MG_DNS_MESSAGE: {
                mg_dns_message *msg = (mg_dns_message*) ev_data;
                for (int i = 0; i < msg->num_questions; ++i) {
                    mg_dns_resource_record* rr = &msg->questions[i];

                    long qId = server->genQuestionId();
                    auto dnsQuestion = std::make_shared<DnsServerQuestion>(server->ownId_, qId, server->mgr_, nc, msg, i);
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

                nc->flags &= ~MG_F_SEND_AND_CLOSE;
                break;
            }
        }
    });

    if (listener_ == nullptr)
        throw std::runtime_error("Failed to create DNS listener");

    mg_set_protocol_dns(listener_);

    serverThread_ = std::make_shared<std::thread>([this]() {
        mgThreadId_ = std::this_thread::get_id();
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
    removeServer_g(ownId_);
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
