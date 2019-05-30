//
// Created by Leonid Novikov on 4/18/19.
//

#include "HttpClient.h"
#include "../types/UBinder.h"
#include "../serialization/BossSerializer.h"
#include "../tools/Semaphore.h"
#include "../crypto/base64.h"

namespace network {

std::function<void(int,byte_vector&&)> stub = [](int a,byte_vector&& b){};

HttpClientWorker::HttpClientWorker(int newId, HttpClient& parent)
  : id_(newId)
  , parentRef_(parent)
  , worker_(1)
  , mgr_(new mg_mgr(), [](auto p){mg_mgr_free(p);delete p;})
  , callback_(stub){
    mg_mgr_init(mgr_.get(), this);
};

void HttpClientWorker::sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback) {
    callback_ = std::move(callback);
    worker_([this,url](){
        exitFlag_ = false;
        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = this;
        mg_connect_http_opt1(mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpClientWorker* clientWorker = (HttpClientWorker*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                http_message *hm = (http_message*)ev_data;
                byte_vector bv(hm->body.len);
                memcpy(&bv[0], hm->body.p, hm->body.len);
                clientWorker->callback_(hm->resp_code, std::move(bv));
                clientWorker->callback_ = stub;
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_CONNECT) {
                if (*(int *) ev_data != 0) {
                    clientWorker->exitFlag_ = true;
                }
            } else if (ev == MG_EV_CLOSE) {
                clientWorker->exitFlag_ = true;
            }
        }, opts, url.c_str(), nullptr, nullptr, 0, "GET");
        while (!exitFlag_) {
            mg_mgr_poll(mgr_.get(), 100);
        }
        parentRef_.releaseWorker(id_);
    });
}

const std::string idChars = "0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
string randomString(int length) {
    byte_vector randomBytes(length);
    sprng_read(&randomBytes[0], length, NULL);
    std::string res;
    for (int i = 0; i < length; ++i)
        res += idChars[randomBytes[i]%idChars.size()];
    return res;
}

void HttpClientWorker::sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    callback_ = std::move(callback);
    worker_([this,url,method,reqBody](){
        exitFlag_ = false;
        mg_connect_opts opts;
        memset(&opts, 0, sizeof(opts));
        opts.user_data = this;

        std::string boundary = "==boundary==" + randomString(48);
        std::string extHeaders = "";
        extHeaders += "Content-Type: multipart/form-data; boundary=" + boundary + "\r\n";
        extHeaders += "User-Agent: Universa JAVA API Client\r\n";
        extHeaders += "connection: close\r\n";
        string bodyPrefixStr = "";
        bodyPrefixStr += "--" + boundary + "\r\n";
        bodyPrefixStr += "Content-Disposition: form-data; name=\"requestData\"; filename=\"requestData.boss\"\r\n";
        bodyPrefixStr += "Content-Type: application/octet-stream\r\n";
        bodyPrefixStr += "Content-Transfer-Encoding: binary\r\n\r\n";
        byte_vector body(bodyPrefixStr.begin(), bodyPrefixStr.end());
        body.insert(body.end(), reqBody.begin(), reqBody.end());
        string bodyPostfixStr = "\r\n--" + boundary + "--\r\n";
        byte_vector bodyPostfix(bodyPostfixStr.begin(), bodyPostfixStr.end());
        body.insert(body.end(), bodyPostfix.begin(), bodyPostfix.end());
        mg_connect_http_opt1(mgr_.get(), [](mg_connection *nc, int ev, void *ev_data){
            HttpClientWorker* clientWorker = (HttpClientWorker*)nc->user_data;
            if (ev == MG_EV_HTTP_REPLY) {
                http_message *hm = (http_message*)ev_data;
                byte_vector bv(hm->body.len);
                memcpy(&bv[0], hm->body.p, hm->body.len);
                clientWorker->callback_(hm->resp_code, std::move(bv));
                clientWorker->callback_ = stub;
                nc->flags |= MG_F_CLOSE_IMMEDIATELY;
            } else if (ev == MG_EV_CONNECT) {
                if (*(int *) ev_data != 0) {
                    clientWorker->exitFlag_ = true;
                }
            } else if (ev == MG_EV_CLOSE) {
                clientWorker->exitFlag_ = true;
            }
        }, opts, url.c_str(), extHeaders.c_str(), (const char*)&body[0], (int)body.size(), method.c_str());
        while (!exitFlag_) {
            mg_mgr_poll(mgr_.get(), 100);
        }
        parentRef_.releaseWorker(id_);
    });
}

HttpClient::HttpClient(const std::string& rootUrl, size_t poolSize)
  : poolControlThread_(1)
  , commandPool_(poolSize) {
    poolSize_ = poolSize;
    rootUrl_ = rootUrl;
    for (int i = 0; i < poolSize_; ++i) {
        std::shared_ptr<HttpClientWorker> client = make_shared<HttpClientWorker>(i,*this);
        pool_.push(client);
    }
}

HttpClient::~HttpClient() {
    std::unique_lock lock(poolMutex_);
    for (auto &it: usedWorkers_)
        it.second->stop();
    while (pool_.size() < poolSize_)
        poolCV_.wait(lock);
}

std::shared_ptr<HttpClientWorker> HttpClient::getUnusedWorker() {
    std::unique_lock lock(poolMutex_);
    while (pool_.empty())
        poolCV_.wait(lock);
    auto client = pool_.front();
    pool_.pop();
    usedWorkers_[client->getId()] = client;
    return client;
}

void HttpClient::releaseWorker(int workerId) {
    std::lock_guard guard(poolMutex_);
    pool_.push(usedWorkers_[workerId]);
    usedWorkers_.erase(workerId);
    poolCV_.notify_one();
}

void HttpClient::sendGetRequest(const std::string& url, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendGetRequest(url, std::move(callbackCopy));
}

void HttpClient::sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback) {
    poolControlThread_.execute([callback{std::move(callback)}, url, this]() mutable {
        auto client = getUnusedWorker();
        client->sendGetRequest(url, std::move(callback));
    });
}

void HttpClient::sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback) {
    std::function<void(int,byte_vector&&)> callbackCopy = callback;
    sendRawRequest(url, method, reqBody, std::move(callbackCopy));
}

void HttpClient::sendRawRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback) {
    std::string fullUrl = rootUrl_ + "/" + url;
    poolControlThread_.execute([callback{std::move(callback)}, url, method, reqBody, this]() mutable {
        auto client = getUnusedWorker();
        std::string fullUrl = rootUrl_ + "/" + url;
        client->sendRawRequest(fullUrl, method, reqBody, std::move(callback));
    });
}

void HttpClient::start(const crypto::PrivateKey& clientKey, const crypto::PublicKey& nodeKey) {
    if (session_) {
        printf("use existing session\n");
        //TODO: restore session
    } else {
        Semaphore sem;
        session_ = std::make_shared<HttpClientSession>();
        session_->nodePublicKey = std::make_shared<crypto::PublicKey>(nodeKey);
        session_->clientPrivateKey = std::make_shared<crypto::PrivateKey>(clientKey);
        UBinder params = UBinder::of("client_key", UBytes(crypto::PublicKey(clientKey).pack()));
        byte_vector paramsBin = BossSerializer::serialize(params).get();
        byte_vector server_nonce;
        sendRawRequest("connect", "POST", paramsBin, [this,&sem,&server_nonce](int respCode, byte_vector&& respBody){
            UBytes ub(std::move(respBody));
            UObject uObject = BossSerializer::deserialize(ub);
            UBinder binderWrap = UBinder::asInstance(uObject);
            UBinder binder = binderWrap.getBinder("response");
            std::string strSessionId = binder.getString("session_id");
            session_->sessionId = std::stol(strSessionId);
            UBytes serverNonceUb = UBytes::asInstance(binder.get("server_nonce"));
            server_nonce = serverNonceUb.get();
            sem.notify();
        });
        sem.wait();
        byte_vector client_nonce(47);
        sprng_read(&client_nonce[0], client_nonce.size(), NULL);
        byte_vector client_nonce_copy = client_nonce;
        byte_vector data = BossSerializer::serialize(UBinder::of("client_nonce", UBytes(std::move(client_nonce_copy)), "server_nonce", UBytes(std::move(server_nonce)))).get();
        byte_vector sig = clientKey.sign(data, crypto::HashType::SHA512);
        paramsBin = BossSerializer::serialize(UBinder::of(
                "signature", UBytes(std::move(sig)),
                "data", UBytes(std::move(data)),
                "session_id", session_->sessionId)).get();
        byte_vector dataRcv;
        byte_vector sigRcv;
        sendRawRequest("get_token", "POST", paramsBin, [&sem,&dataRcv,&sigRcv](int respCode, byte_vector&& respBody) {
            UBinder binder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(respBody)))).getBinder("response");
            dataRcv = UBytes::asInstance(binder.get("data")).get();
            sigRcv = UBytes::asInstance(binder.get("signature")).get();
            sem.notify();
        });
        sem.wait();
        if (!session_->nodePublicKey->verify(sigRcv, dataRcv, crypto::HashType::SHA512)) {
            throw std::runtime_error("node signature failed");
        }
        UBinder paramsRcv = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(dataRcv))));
        byte_vector clientNonceRcv = UBytes::asInstance(paramsRcv.get("client_nonce")).get();
        if (client_nonce != clientNonceRcv) {
            throw std::runtime_error("client nonce mismatch");
        }
        byte_vector encrypted_token = UBytes::asInstance(paramsRcv.get("encrypted_token")).get();
        byte_vector key = UBytes::asInstance(UBinder::asInstance(BossSerializer::deserialize(session_->clientPrivateKey->decrypt(encrypted_token))).get("sk")).get();
        session_->sessionKey = make_shared<crypto::SymmetricKey>(key);
        std::string status = "error";
        execCommand("hello", UBinder(), [this,&sem,&status](UBinder&& res){
            session_->connectMessage = res.getString("message");
            status = res.getString("status");
            sem.notify();
        });
        sem.wait();
        if (status != "OK")
            throw std::runtime_error("connection failed: " + session_->connectMessage);
    }

}

void HttpClient::command(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete) {
    execCommand(name, params, std::move(onComplete));
}

void HttpClient::command(const std::string& name, const UBinder& params, const std::function<void(UBinder&&)>& onComplete) {
    auto onCompleteCopy = onComplete;
    execCommand(name, params, std::move(onCompleteCopy));
}

void HttpClient::execCommand(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete) {
    commandPool_.execute([this, name, params, onComplete{std::move(onComplete)}](){
        if (!session_ || !session_->sessionKey)
            throw std::runtime_error("Session does not created or session key is not got yet.");
        UBinder call = UBinder::of("command", name, "params", params);
        byte_vector callBin = BossSerializer::serialize(call).get();
        UBinder cmdParams = UBinder::of(
                "command", "command",
                "params", UBytes(session_->sessionKey->encrypt(callBin)),
                "session_id", session_->sessionId);
        Semaphore sem;
        UBinder result;
        sendRawRequest("command", "POST", BossSerializer::serialize(cmdParams).get(), [this,&result,&sem](int respCode, byte_vector&& respBody){
            UBinder ansBinder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(respBody))));
            UBinder responseBinder = ansBinder.getBinder("response");
            byte_vector decrypted = session_->sessionKey->decrypt(UBytes::asInstance(responseBinder.get("result")).get());
            UBinder decryptedBinder = UBinder::asInstance(BossSerializer::deserialize(UBytes(std::move(decrypted))));
            result = decryptedBinder.getBinder("result");
            sem.notify();
        });
        sem.wait();
        onComplete(std::move(result));
    });
}

}
