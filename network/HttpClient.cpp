/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#include "HttpClient.h"
#include "../types/UBinder.h"
#include "../serialization/BossSerializer.h"
#include "../tools/Semaphore.h"
#include "../tools/AutoThreadPool.h"
#include "../crypto/base64.h"

namespace network {

const int HttpClient::CLIENT_VERSION = 3;
std::mutex HttpClient::workerInitMutex_;
std::shared_ptr<HttpClientWorkerAsync> HttpClient::worker_;

const std::string idChars = "0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
string randomString(int length) {
    byte_vector randomBytes(length);
    sprng_read(&randomBytes[0], length, NULL);
    std::string res;
    for (int i = 0; i < length; ++i)
        res += idChars[randomBytes[i]%idChars.size()];
    return res;
}

HttpClientWorkerAsync::HttpClientWorkerAsync(int newId, HttpClient& parent, int pollPeriodMillis)
: id_(newId)
, parentRef_(parent)
, mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;})
, activeReqsCount_(0) {
    mg_mgr_init(mgr_.get(), this);
    pollThread_ = std::make_shared<std::thread>([this,pollPeriodMillis](){
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
            mg_mgr_poll(mgr_.get(), pollPeriodMillis);
        }
    });
};

long HttpClientWorkerAsync::saveReq(HttpRequestHolder&& req) {
    long reqId = nextReqId_;
    std::lock_guard lock(reqsMutex_);
    reqs_.insert(std::make_pair(reqId, std::move(req)));
    ++nextReqId_;
    if (nextReqId_ >= LONG_MAX)
        nextReqId_ = 1;
    return reqId;
}

void HttpClientWorkerAsync::removeReq(long reqId) {
    std::lock_guard lock(reqsMutex_);
    reqs_.erase(reqId);
}

HttpRequestHolder* HttpClientWorkerAsync::getReq(long reqId) {
    std::lock_guard lock(reqsMutex_);
    if (reqs_.find(reqId) != reqs_.end())
        return &reqs_[reqId];
    return nullptr;
}

void HttpClientWorkerAsync::sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback) {
    std::lock_guard lock(reqsBufMutex_);
    reqsBuf_.push_back([this,url,callback{std::move(callback)}](){
        HttpRequestHolder holder;
        holder.workerRef = this;
        holder.url = url;
        holder.callback = std::move(callback);
        long reqId = saveReq(std::move(holder));
        auto* ph = getReq(reqId);
        ph->reqId = reqId;

        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = ph;
        mg_connection* mgcon = mg_connect_http_opt1(ph->workerRef->mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpRequestHolder* ph = (HttpRequestHolder*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                mg_set_timer(nc, 0);
                http_message *hm = (http_message*)ev_data;
                byte_vector bv(hm->body.len);
                memcpy(&bv[0], hm->body.p, hm->body.len);
                ph->callback(hm->resp_code, std::move(bv));
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_TIMER) {
                ph->callback(408, byte_vector());
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            }
        }, opts, ph->url.c_str(), nullptr, nullptr, 0, "GET");
        mg_set_timer(mgcon, double(getCurrentTimeMillis() + requestTimeoutMillis_)/1000.0);
    });
}

void HttpClientWorkerAsync::sendBinRequest(const std::string& url, const std::string& method,
        const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    std::lock_guard lock(reqsBufMutex_);
    reqsBuf_.push_back([this,url,method,reqBody,callback{std::move(callback)}](){
        HttpRequestHolder holder;
        holder.workerRef = this;
        holder.url = url;
        holder.method = method;
        holder.reqBody = reqBody;
        holder.callback = std::move(callback);
        long reqId = saveReq(std::move(holder));
        auto* ph = getReq(reqId);
        ph->reqId = reqId;

        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = ph;

        std::string boundary = "==boundary==" + randomString(48);
        std::string extHeaders = "";
        extHeaders += "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
        extHeaders += "User-Agent: Universa U8 API Client\r\n";
        extHeaders += "connection: close\r\n";
        string bodyPrefixStr = "";
        bodyPrefixStr += "--" + boundary + "\r\n";
        bodyPrefixStr += "Content-Disposition: form-data; name=\"requestData\"; filename=\"requestData.boss\"\r\n";
        bodyPrefixStr += "Content-Type: application/octet-stream\r\n";
        bodyPrefixStr += "Content-Transfer-Encoding: binary\r\n\r\n";
        byte_vector body(bodyPrefixStr.begin(), bodyPrefixStr.end());
        body.insert(body.end(), ph->reqBody.begin(), ph->reqBody.end());
        string bodyPostfixStr = "\r\n--" + boundary + "--\r\n";
        byte_vector bodyPostfix(bodyPostfixStr.begin(), bodyPostfixStr.end());
        body.insert(body.end(), bodyPostfix.begin(), bodyPostfix.end());
        mg_connection* mgcon = mg_connect_http_opt1(ph->workerRef->mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpRequestHolder* ph = (HttpRequestHolder*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                mg_set_timer(nc, 0);
                http_message *hm = (http_message*)ev_data;
                byte_vector bv(hm->body.len);
                memcpy(&bv[0], hm->body.p, hm->body.len);
                ph->callback(hm->resp_code, std::move(bv));
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_TIMER) {
                ph->callback(408, byte_vector());
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            }
        }, opts, ph->url.c_str(), extHeaders.c_str(), (const char*)&body[0], (int)body.size(), ph->method.c_str());
        mg_set_timer(mgcon, double(getCurrentTimeMillis() + requestTimeoutMillis_)/1000.0);
    });
}

void HttpClientWorkerAsync::sendRawRequest(const std::string& url, const std::string& method,
        const std::string& extHeaders, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    std::lock_guard lock(reqsBufMutex_);
    reqsBuf_.push_back([this,url,method,extHeaders,reqBody,callback{std::move(callback)}](){
        HttpRequestHolder holder;
        holder.workerRef = this;
        holder.url = url;
        holder.method = method;
        holder.extHeaders = extHeaders;
        holder.reqBody = reqBody;
        holder.callback = std::move(callback);
        long reqId = saveReq(std::move(holder));
        auto* ph = getReq(reqId);
        ph->reqId = reqId;

        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = ph;

        mg_connection* mgcon = mg_connect_http_opt1(ph->workerRef->mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpRequestHolder* ph = (HttpRequestHolder*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                mg_set_timer(nc, 0);
                http_message *hm = (http_message*)ev_data;
                byte_vector bv(hm->body.len);
                memcpy(&bv[0], hm->body.p, hm->body.len);
                ph->callback(hm->resp_code, std::move(bv));
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_TIMER) {
                ph->callback(408, byte_vector());
                ph->workerRef->activeReqsCount_ -= 1;
                ph->workerRef->removeReq(ph->reqId);
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            }
        }, opts, ph->url.c_str(), ph->extHeaders.c_str(), (const char*)&ph->reqBody[0], (int)ph->reqBody.size(), ph->method.c_str());
        mg_set_timer(mgcon, double(getCurrentTimeMillis() + requestTimeoutMillis_)/1000.0);
    });
}

void HttpClientWorkerAsync::stop() {
    exitFlag_ = true;
    pollThread_->join();
};

HttpClient::HttpClient(const std::string& rootUrl, int pollPeriodMillis) {
    std::lock_guard lock(HttpClient::workerInitMutex_);
    if (worker_ == nullptr) {
        worker_ = std::shared_ptr<HttpClientWorkerAsync>(new HttpClientWorkerAsync(1, *this, pollPeriodMillis), [](auto p){
            p->stop();
            delete p;
        });
    }
    rootUrl_ = rootUrl;
}

HttpClient::~HttpClient() {
    // do not stop it here because worker_ is static. one worker for all http clients
    //worker_->stop();
}

void HttpClient::sendGetRequest(const std::string& path, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendGetRequest(path, std::move(callbackCopy));
}

void HttpClient::sendGetRequest(const std::string& path, std::function<void(int,byte_vector&&)>&& callback) {
    std::string fullUrl = makeFullUrl(path);
    worker_->sendGetRequest(fullUrl, std::move(callback));
}

void HttpClient::sendGetRequestUrl(const std::string& url, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendGetRequest(url, std::move(callbackCopy));
}

void HttpClient::sendGetRequestUrl(const std::string& url, std::function<void(int,byte_vector&&)>&& callback) {
    worker_->sendGetRequest(url, std::move(callback));
}

void HttpClient::sendBinRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendBinRequest(url, method, reqBody, std::move(callbackCopy));
}

void HttpClient::sendBinRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    std::string fullUrl = makeFullUrl(url);
    worker_->sendBinRequest(fullUrl, method, reqBody, std::move(callback));
}

void HttpClient::sendRawRequestUrl(const std::string& url, const std::string& method, const std::string& extHeaders, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendRawRequestUrl(url, method, extHeaders, reqBody, std::move(callbackCopy));
}

void HttpClient::sendRawRequestUrl(const std::string& url, const std::string& method, const std::string& extHeaders, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    std::string fullUrl = makeFullUrl(url);
    worker_->sendRawRequest(fullUrl, method, extHeaders, reqBody, std::move(callback));
}

void HttpClient::start(const crypto::PrivateKey& clientKey, const crypto::PublicKey& nodeKey) {
    if (session_) {
        printf("TODO: restore session\n");
        //TODO: restore session
    } else {
        shared_ptr<Semaphore> sem = make_shared<Semaphore>();
        session_ = std::make_shared<HttpClientSession>();
        session_->nodePublicKey = std::make_shared<crypto::PublicKey>(nodeKey);
        session_->clientPrivateKey = std::make_shared<crypto::PrivateKey>(clientKey);
        UBinder params = UBinder::of("client_key", UBytes(crypto::PublicKey(clientKey).pack()),
                "client_version", HttpClient::CLIENT_VERSION);
        byte_vector paramsBin = BossSerializer::serialize(params).get();
        shared_ptr<byte_vector> server_nonce = make_shared<byte_vector>();
        shared_ptr<int> server_version = make_shared<int>(1);
        shared_ptr<string> error = make_shared<string>("");
        auto session = session_;
        sendBinRequest("/connect", "POST", paramsBin, [session,sem,server_nonce,server_version,error](int respCode, byte_vector&& respBody){
            try {
                UBytes ub(std::move(respBody));
                UObject uObject = BossSerializer::deserialize(ub);
                UBinder binderWrap = UBinder::asInstance(uObject);
                UBinder binder = binderWrap.getBinder("response");
                std::string strSessionId = binder.getString("session_id");
                session->sessionId = std::stol(strSessionId);
                UBytes serverNonceUb = UBytes::asInstance(binder.get("server_nonce"));
                byte_vector serverNonce = serverNonceUb.get();
                server_nonce.get()->assign(serverNonce.begin(), serverNonce.end());
                (*server_version) = binder.getIntOrDefault("server_version", 1);
                session->version = std::min(int(*server_version), HttpClient::CLIENT_VERSION);
            } catch (const std::exception& e) {
                error.get()->assign(e.what());
            }
            sem->notify();
        });
        if (!sem->wait(std::chrono::milliseconds(startTimeoutMillis_)))
            throw std::runtime_error("HttpClient timeout while starting secure connection(a) ("+rootUrl_+")");
        if (!(*error).empty())
            throw std::runtime_error("HttpClient error while starting secure connection(b) ("+rootUrl_+"): " + *error);
        byte_vector client_nonce(47);
        sprng_read(&client_nonce[0], client_nonce.size(), NULL);
        byte_vector client_nonce_copy = client_nonce;
        byte_vector data = BossSerializer::serialize(UBinder::of(
                "client_nonce", UBytes(std::move(client_nonce_copy)),
                "server_nonce", UBytes(std::move(*server_nonce)),
                "server_version", int(*server_version),
                "client_version", HttpClient::CLIENT_VERSION
                )).get();
        byte_vector sig = clientKey.sign(data, crypto::HashType::SHA512);
        paramsBin = BossSerializer::serialize(UBinder::of(
                "signature", UBytes(std::move(sig)),
                "data", UBytes(std::move(data)),
                "session_id", session_->sessionId)).get();
        shared_ptr<byte_vector> dataRcv = make_shared<byte_vector>();
        shared_ptr<byte_vector> sigRcv = make_shared<byte_vector>();
        sendBinRequest("/get_token", "POST", paramsBin, [sem,dataRcv,sigRcv,error](int respCode, byte_vector&& respBody) {
            try {
                UBinder binder = UBinder::asInstance(
                        BossSerializer::deserialize(UBytes(std::move(respBody)))).getBinder("response");
                *dataRcv = UBytes::asInstance(binder.get("data")).get();
                *sigRcv = UBytes::asInstance(binder.get("signature")).get();
            } catch (const std::exception& e) {
                error.get()->assign(e.what());
            }
            sem->notify();
        });
        if (!sem->wait(std::chrono::milliseconds(startTimeoutMillis_)))
            throw std::runtime_error("HttpClient timeout while starting secure connection(c) (get_token)");
        if (!(*error).empty())
            throw std::runtime_error("HttpClient error while starting secure connection(d): " + *error);
        if (!session_->nodePublicKey->verify(*sigRcv, *dataRcv, crypto::HashType::SHA512)) {
            throw std::runtime_error("node signature failed");
        }
        byte_vector dataRcvBin = *dataRcv;
        UBinder paramsRcv = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(dataRcvBin))));
        byte_vector clientNonceRcv = UBytes::asInstance(paramsRcv.get("client_nonce")).get();
        if (client_nonce != clientNonceRcv) {
            throw std::runtime_error("client nonce mismatch");
        }
        byte_vector encrypted_token = UBytes::asInstance(paramsRcv.get("encrypted_token")).get();
        byte_vector key = UBytes::asInstance(UBinder::asInstance(BossSerializer::deserialize(session_->clientPrivateKey->decrypt(encrypted_token))).get("sk")).get();
        session_->sessionKey = make_shared<crypto::SymmetricKey>(key);
        shared_ptr<string> status = make_shared<string>("error");
        execCommand("hello", UBinder(), [session,sem,status,error](UBinder&& res, bool isError){
            if (!isError) {
                session->connectMessage = res.getString("message");
                std::string strStatus = res.getString("status");
                status.get()->assign(strStatus);
                if (strStatus != "OK")
                    error.get()->assign("(hello failed)");
            } else {
                error.get()->assign("(hello)");
            }
            sem->notify();
        });
        if (!sem->wait(std::chrono::milliseconds(startTimeoutMillis_)))
            throw std::runtime_error("HttpClient timeout while starting secure connection(e) (hello)");
        if (!(*error).empty())
            throw std::runtime_error("HttpClient error while starting secure connection(f): " + *error);
        if (*status != "OK")
            throw std::runtime_error("connection failed: " + session_->connectMessage);
    }

}

void HttpClient::command(const std::string& name, const UBinder& params, std::function<void(UBinder&&,bool)>&& onComplete) {
    UBinder call = UBinder::of("command", name, "params", params);
    byte_vector callBin = BossSerializer::serialize(call).get();
    execCommand(callBin, [onComplete{std::move(onComplete)}](byte_vector&& decrypted, bool isError){
        UBinder decryptedBinder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(decrypted))));
        UBinder result = decryptedBinder.getBinder("result");
        onComplete(std::move(result), isError);
    });
}

void HttpClient::command(const std::string& name, const UBinder& params, const std::function<void(UBinder&&,bool)>& onComplete) {
    auto onCompleteCopy = onComplete;
    command(name, params, std::move(onCompleteCopy));
}

void HttpClient::command(const byte_vector& callBin, std::function<void(byte_vector&&,bool)>&& onComplete) {
    execCommand(callBin, std::move(onComplete));
}

void HttpClient::command(const byte_vector& callBin, const std::function<void(byte_vector&&,bool)>& onComplete) {
    auto onCompleteCopy = onComplete;
    execCommand(callBin, std::move(onCompleteCopy));
}

void HttpClient::execCommand(const byte_vector& callBin, std::function<void(byte_vector&&,bool)>&& onComplete) {
    runAsync([this, callBin, onComplete{std::move(onComplete)}](){
        if (!session_ || !session_->sessionKey) {
            onComplete(std::move(stringToBytes("Session does not created or session key is not got yet.")), true);
            return;
        }
        UBinder cmdParams = UBinder::of(
                "command", "command",
                "params", session_->version >= 2 ?
                    UBytes(session_->sessionKey->etaEncrypt(callBin)) :
                    UBytes(session_->sessionKey->encrypt(callBin)),
                "session_id", session_->sessionId);
        auto session = session_;
        sendBinRequest("/command", "POST", BossSerializer::serialize(cmdParams).get(), [session,onComplete{onComplete}](int respCode, byte_vector&& respBody){
            try {
                bool isError = false;
                if (respCode == 408)
                    isError = true;
                if (!isError) {
                    UBinder ansBinder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(respBody))));
                    UBinder responseBinder = ansBinder.getBinder("response");
                    byte_vector decrypted = session->version >= 2 ?
                        session->sessionKey->etaDecrypt(UBytes::asInstance(responseBinder.get("result")).get()) :
                        session->sessionKey->decrypt(UBytes::asInstance(responseBinder.get("result")).get());
                    onComplete(std::move(decrypted), isError);
                } else {
                    onComplete(stringToBytes("respCode="+to_string(respCode)), isError);
                }
            } catch (const std::exception& e) {
                std::string error = e.what();
                onComplete(std::move(stringToBytes(error)), true);
            }
        });
    });
}

void HttpClient::execCommand(const std::string& name, const UBinder& params, std::function<void(UBinder&&,bool)>&& onComplete) {
    UBinder call = UBinder::of("command", name, "params", params);
    byte_vector callBin = BossSerializer::serialize(call).get();
    execCommand(callBin, [onComplete{std::move(onComplete)}](byte_vector&& decrypted, bool isError){
        try {
            UBinder decryptedBinder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(decrypted))));
            UBinder result = decryptedBinder.getBinder("result");
            onComplete(std::move(result), isError);
        } catch (const std::exception& e) {
            std::string strError(e.what());
            UBinder errBinder = UBinder::of("error", strError);
            onComplete(std::move(errBinder), true);
        }
    });
}

std::string HttpClient::makeFullUrl(const std::string& path) {
    return rootUrl_ + path;
}

}
