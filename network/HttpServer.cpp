/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include <thread>
#include "HttpServer.h"
#include "../types/UBytes.h"
#include "../types/UObject.h"
#include "../serialization/BossSerializer.h"
#include "../crypto/base64.h"
#include "../crypto/PublicKey.h"

namespace network {

const int HttpServer::SERVER_VERSION = 3;

struct HttpServerRequestHolder {
    HttpServerRequest* pReq;
    mg_connection *nc;
};


HttpServerRequest::HttpServerRequest(mg_connection* con, http_message *hm, std::shared_ptr<mg_mgr> mgr, const std::string& endpoint, const std::string& path) {
    con_ = con;
    queryString_ = std::string(hm->query_string.p, hm->query_string.len);
    method_ = std::string(hm->method.p, hm->method.len);
    body_.resize(hm->body.len);
    memcpy(&body_[0], hm->body.p, hm->body.len);
    mgr_ = mgr;
    endpoint_ = endpoint;
    path_ = path;
    extHeaders_["Content-Type"] = "application/octet-stream";
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

void HttpServerRequest::sendAnswerFromAnotherThread() {
    HttpServerRequestHolder holder;
    holder.pReq = this;
    holder.nc = this->con_;
    mg_broadcast(mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
        HttpServerRequestHolder* holder = (HttpServerRequestHolder*)ev_data;
        if (nc == holder->nc) {
            HttpServerRequest* pReq = holder->pReq;
            pReq->sendAnswer();
            delete pReq;
        }
    }, (void*)(&holder), sizeof(holder));
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

std::string HttpServerRequest::getQueryString() {
    return queryString_;
}

std::string HttpServerRequest::getMethod() {
    return method_;
}

byte_vector HttpServerRequest::getRequestBody() {
    return body_;
}

std::unordered_map<std::string, byte_vector> HttpServerRequest::parseMultipartData() {
    std::unordered_map<std::string, byte_vector> res;
    const char* chunk;
    size_t chunk_len, n1, n2;
    char var_name[100], file_name[100];
    n1 = n2 = 0;
    while ((n2 = mg_parse_multipart((char*)&body_[n1], body_.size()-n1,
                                    var_name, sizeof(var_name),
                                    file_name, sizeof(file_name),
                                    &chunk, &chunk_len)) > 0) {
        byte_vector bv(chunk_len);
        memcpy(&bv[0], chunk, chunk_len);
        res[var_name] = std::move(bv);
        n1 += n2;
    }
    return res;
}

HttpService::HttpService(std::string host, int port, int poolSize)
  : mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;})
  , receivePool_(poolSize) {
    mg_mgr_init(mgr_.get(), this);
    std::string addr = host + ":" + std::to_string(port);
    listener_ = mg_bind(mgr_.get(), addr.c_str(), [](mg_connection *nc, int ev, void *ev_data){
        if (ev == MG_EV_HTTP_REQUEST) {
            HttpService* server = (HttpService*)nc->mgr->user_data;
            http_message* hm = (http_message*)ev_data;
            std::string strUri = std::string(hm->uri.p, hm->uri.len);
            std::string s = strUri;
            size_t indx = s.size();
            bool show404 = true;
            while (indx != std::string::npos) {
                s = strUri.substr(0, indx);
                if (server->routes_.find(s) != server->routes_.end()) {
                    show404 = false;
                    HttpServerRequest* request = new HttpServerRequest(nc, hm, server->mgr_, s, strUri);
                    server->receivePool_.execute([server,s,request](){
                        server->routes_[s](request);
                    });
                    break;
                }
                indx = s.find_last_of("/", string::npos);
            }
            if (show404) {
                //printf("404 for: %s\n", strUri.c_str());
                mg_http_send_error(nc, 404, nullptr);
            }
        }
    });
    if (listener_ == nullptr)
        throw std::runtime_error("Failed to create listener");
    mg_set_protocol_http_websocket(listener_);
}

void HttpService::start() {
    serverThread_ = std::make_shared<std::thread>([this]() {
        while (!exitFlag_)
            mg_mgr_poll(mgr_.get(), 100);
        mgr_.reset();
    });
}

void HttpService::stop() {
    exitFlag_ = true;
}

void HttpService::join() {
    serverThread_->join();
}

void HttpService::addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest*)>& callback) {
    routes_[endpoint] = callback;
}

HttpServer::HttpServer(std::string host, int port, int poolSize)
 : service_(host, port, poolSize)
 , minstdRand_(std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::high_resolution_clock::now().time_since_epoch()).count()) {
    nextSessionId_ = getCurrentTimeMillis()/1000 + minstdRand_();
    for (int i = 0; i <= SERVER_VERSION; ++i) {
        sessionsByKeyAndVersion_.push_back(std::unordered_map<std::string, std::shared_ptr<HttpServerSession>>());
    }
}

void HttpServer::start() {
    service_.start();
}

void HttpServer::stop() {
    service_.stop();
}

void HttpServer::join() {
    service_.join();
}

void HttpServer::addEndpoint(const std::string& endpoint, const std::function<void(HttpServerRequest*)>& callback) {
    service_.addEndpoint(endpoint, callback);
}

void HttpServer::addEndpoint(const std::string& endpoint, std::function<void(HttpServerRequest*)>&& callback) {
    service_.addEndpoint(endpoint, std::move(callback));
}

void HttpServer::addSecureCallback(const std::function<void(const byte_vector& params, std::shared_ptr<HttpServerSession> session,
        std::function<void(const byte_vector& ansBin)>&&)>& callback) {
    secureCallback_ = callback;
}

void HttpServer::addSecureCallback(std::function<void(const byte_vector& params, std::shared_ptr<HttpServerSession> session,
        std::function<void(const byte_vector& ansBin)>&&)>&& callback) {
    secureCallback_ = std::move(callback);
}

UBinder HttpServer::extractParams(std::unordered_map<std::string, byte_vector>& reqParams) {
    try {
        if (reqParams.find("requestData64") != reqParams.end()) {
            byte_vector &bv = reqParams[std::string("requestData")];
            string s(bv.begin(), bv.end());
            byte_vector decoded = base64_decodeToBytes(s);
            UBytes pack(std::move(decoded));
            UObject obj = BossSerializer::deserialize(pack);
            UBinder binder = UBinder::asInstance(obj);
            return binder;
        } else {
            byte_vector bv = reqParams[std::string("requestData")];
            UBytes pack(std::move(bv));
            UObject obj = BossSerializer::deserialize(pack);
            UBinder binder = UBinder::asInstance(obj);
            return binder;
        }
    } catch (const std::exception& e) {
        return UBinder::of("status", "error", "message", e.what());
    }
    return UBinder();
}

void HttpServer::initSecureProtocol(const crypto::PrivateKey& nodePrivateKey) {
    myKey_ = make_shared<crypto::PrivateKey>(nodePrivateKey.pack());
    addEndpoint("/connect", [this](HttpServerRequest *req){
        try {
            auto res = req->parseMultipartData();
            UBinder binder = extractParams(res);
            UObject clientKeyObj = binder.get("client_key");
            int version = binder.getIntOrDefault("client_version", 0);
            UBytes clientKeyBytes = UBytes::asInstance(clientKeyObj);
            crypto::PublicKey clientKey(clientKeyBytes.get());
            auto session = getSession(clientKey, version);
            std::lock_guard lock(session->connectMutex);
            if (session->serverNonce.size() == 0) {
                session->serverNonce.resize(48);
                sprng_read(&session->serverNonce[0], session->serverNonce.size(), NULL);
            }
            byte_vector serverNonceCopy = session->serverNonce;
            UBinder ans = UBinder::of(
                "result", "ok",
                "response", UBinder::of(
                    "server_nonce", UBytes(std::move(serverNonceCopy)),
                    "server_version", UInt(SERVER_VERSION),
                    "session_id", std::to_string(session->sessionId)
                )
            );
            req->setAnswerBody(BossSerializer::serialize(ans).get());
            req->sendAnswerFromAnotherThread();
        } catch (const std::exception& e) {
            req->setStatusCode(500);
            UBinder ans = UBinder::of("result", "error","response", e.what());
            req->setAnswerBody(BossSerializer::serialize(ans).get());
            req->sendAnswerFromAnotherThread();
        }
    });
    addEndpoint("/get_token", [this](HttpServerRequest *req){
        try {
            auto res = req->parseMultipartData();
            UBinder binder = extractParams(res);
            UObject sessionIdObj = binder.get("session_id");
            UInt sessionIdInt = UInt::asInstance(sessionIdObj);
            long sessionId = sessionIdInt.get();
            auto session = getSession(sessionId);
            std::lock_guard lock(session->connectMutex);
            UObject dataObj = binder.get("data");
            UBytes dataBytes = UBytes::asInstance(dataObj);
            byte_vector signedAnswer = dataBytes.get();
            UObject signatureObj = binder.get("signature");
            UBytes signatureBytes = UBytes::asInstance(signatureObj);
            byte_vector signature = signatureBytes.get();
            if (session->publicKey.verify(signature, signedAnswer, crypto::HashType::SHA512)) {
                UBytes pack(std::move(signedAnswer));
                UObject obj = BossSerializer::deserialize(pack);
                UBinder params = UBinder::asInstance(obj);
                UObject serverNonceObj = params.get("server_nonce");
                UBytes serverNonceBytes = UBytes::asInstance(serverNonceObj);
                byte_vector serverNonce = serverNonceBytes.get();
                UObject clientNonceObj = params.get("client_nonce");
                UBytes clientNonceBytes = UBytes::asInstance(clientNonceObj);
                byte_vector clientNonce = clientNonceBytes.get();
                session->version = params.getIntOrDefault("client_version", 1);
                session->version = std::min(int(session->version), HttpServer::SERVER_VERSION);
                if (serverNonce != session->serverNonce) {
                    req->setStatusCode(500);
                    UBinder ans = UBinder::of("result", "error","response", "server_nonce does not match");
                    req->setAnswerBody(BossSerializer::serialize(ans).get());
                    req->sendAnswerFromAnotherThread();
                } else {
                    // Nonce is ok, we can return session token
                    if (!session->sessionKey) {
                        session->sessionKey = std::make_shared<crypto::SymmetricKey>();
                        UBinder data = UBinder::of("sk", UBytes(session->sessionKey->pack()));
                        session->encryptedAnswer = session->publicKey.encrypt(BossSerializer::serialize(data).get());
                    }
                    byte_vector encryptedAnswer = session->encryptedAnswer;
                    UBinder result = UBinder::of("client_nonce", UBytes(std::move(clientNonce)), "encrypted_token", UBytes(std::move(encryptedAnswer)));
                    byte_vector packed = BossSerializer::serialize(result).get();
                    byte_vector sign = myKey_->sign(packed, crypto::HashType::SHA512);
                    UBinder reqAns = UBinder::of("data", UBytes(std::move(packed)), "signature", UBytes(std::move(sign)));
                    UBinder ans = UBinder::of("result", "ok","response", reqAns);
                    req->setAnswerBody(BossSerializer::serialize(ans).get());
                    req->sendAnswerFromAnotherThread();
                }
            } else {
                req->setStatusCode(500);
                UBinder ans = UBinder::of("result", "error","response", "signature check failed");
                req->setAnswerBody(BossSerializer::serialize(ans).get());
                req->sendAnswerFromAnotherThread();
            }
        } catch (const std::exception& e) {
            req->setStatusCode(500);
            UBinder ans = UBinder::of("result", "error","response", e.what());
            req->setAnswerBody(BossSerializer::serialize(ans).get());
            req->sendAnswerFromAnotherThread();
        }
    });
    addEndpoint("/command", [this](HttpServerRequest *req) {
        inSession(req, [this](byte_vector& params, std::shared_ptr<HttpServerSession> session, std::function<void(const byte_vector& ansBin)>&& sendAnswer){
            secureCallback_(params, session, std::move(sendAnswer));
        });
    });
}

void HttpServer::inSession(
        HttpServerRequest *req,
        std::function<void(
                byte_vector& params, std::shared_ptr<HttpServerSession> session,
                std::function<void(const byte_vector& ansBin)>&& sendAnswer
        )>&& processor) {
    try {
        auto res = req->parseMultipartData();
        UBinder binder = extractParams(res);
        UObject sessionIdObj = binder.get("session_id");
        UInt sessionIdInt = UInt::asInstance(sessionIdObj);
        long sessionId = sessionIdInt.get();
        auto session = getSession(sessionId);
        UObject paramsObj = binder.get("params");
        UBytes paramsBytes = UBytes::asInstance(paramsObj);
        byte_vector paramsBin = paramsBytes.get();
        byte_vector paramsBinDecrypted = (session->version >= 2) ?
                session->sessionKey->etaDecrypt(paramsBin) :
                session->sessionKey->decrypt(paramsBin);
        processor(paramsBinDecrypted, session, [session,req](const byte_vector& reqAnsBin){
            byte_vector encryptedAns = (session->version >= 2) ?
                    session->sessionKey->etaEncrypt(reqAnsBin) :
                    session->sessionKey->encrypt(reqAnsBin);
            UBinder result = UBinder::of("result", UBytes(std::move(encryptedAns)));
            UBinder ans = UBinder::of("result", "ok","response", result);
            req->setAnswerBody(BossSerializer::serialize(ans).get());
            req->sendAnswerFromAnotherThread();
        });
    } catch (const std::exception& e) {
        req->setStatusCode(500);
        UBinder ans = UBinder::of("result", "error","response", e.what());
        req->setAnswerBody(BossSerializer::serialize(ans).get());
        req->sendAnswerFromAnotherThread();
    }
}

std::shared_ptr<HttpServerSession> HttpServer::getSession(crypto::PublicKey& key, int protocolVersion) {
    std::lock_guard lock(mutexSessions_);
    try {
        if (protocolVersion == 0) {
            auto session = std::make_shared<HttpServerSession>(key);
            session->sessionId = nextSessionId_++;
            session->version = protocolVersion;
            if (nextSessionId_ >= LONG_MAX)
                nextSessionId_ = 1;
            sessionsById_[session->sessionId] = session;
            return session;
        }

        auto skey = base64_encode(key.fingerprint());
        auto& protocolSessions = sessionsByKeyAndVersion_.at(protocolVersion);
        if (protocolSessions.find(skey) != protocolSessions.end()) {
            auto session = protocolSessions[skey];
            sessionsById_[session->sessionId] = session;
            return session;
        } else {
            auto session = std::make_shared<HttpServerSession>(key);
            session->sessionId = nextSessionId_++;
            session->version = protocolVersion;
            if (nextSessionId_ >= LONG_MAX)
                nextSessionId_ = 1;
            protocolSessions[skey] = session;
            sessionsById_[session->sessionId] = session;
            return session;
        }
    } catch (const std::exception& e) {
        throw std::runtime_error(e.what());
    }
}

std::shared_ptr<HttpServerSession> HttpServer::getSession(long sessionId) {
    std::lock_guard lock(mutexSessions_);
    auto sessionIter = sessionsById_.find(sessionId);
    if (sessionIter == sessionsById_.end())
        throw std::invalid_argument("bad session number");
    return sessionIter->second;
}

}
