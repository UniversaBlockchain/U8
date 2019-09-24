/*
 * Copyright (c) 2019-present Sergey Chernov, iCodici S.n.C, All Rights Reserved.
 */

#ifndef U8_HTTPCLIENT_H
#define U8_HTTPCLIENT_H

#include <memory>
#include <thread>
#include <atomic>
#include <functional>
#include <unordered_map>
#include <mutex>
#include <queue>
#include "../network/mongoose/mongoose.h"
#include "../network/mongoose/mongooseExt.h"
#include "../tools/ThreadPool.h"
#include "../crypto/PublicKey.h"
#include "../crypto/PrivateKey.h"
#include "../crypto/SymmetricKey.h"
#include "../types/UBinder.h"

namespace network {

class HttpClient;

class HttpClientWorkerAsync;

struct HttpRequestHolder {
    HttpClientWorkerAsync* workerRef;
    long reqId;
    std::string url;
    std::string method;
    std::string extHeaders;
    byte_vector reqBody;
    std::function<void(int,byte_vector&&)> callback;
};

class HttpClientWorkerAsync {
public:
    HttpClientWorkerAsync(int newId, HttpClient& parent, int pollPeriodMillis);
    long saveReq(HttpRequestHolder&& req);
    void removeReq(long reqId);
    HttpRequestHolder* getReq(long reqId);
    void sendGetRequest(const std::string& url, std::function<void(int,byte_vector&&)>&& callback);
    void sendBinRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);
    void sendRawRequest(const std::string& url, const std::string& method, const std::string& extHeaders, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);
    int getId() {return id_;}
    void stop();
private:
    std::mutex reqsBufMutex_;
    std::list<std::function<void()>> reqsBuf_;
    int id_;
    HttpClient& parentRef_;
    std::shared_ptr<std::thread> pollThread_;
    std::shared_ptr<mg_mgr> mgr_;
    std::atomic<bool> exitFlag_ = false;
    std::atomic<long> nextReqId_ = 1;
    std::mutex reqsMutex_;
    std::unordered_map<long, HttpRequestHolder> reqs_;
};

struct HttpClientSession {
    std::string connectMessage;
    shared_ptr<crypto::PrivateKey> clientPrivateKey;
    shared_ptr<crypto::SymmetricKey> sessionKey;
    int64_t sessionId;
    shared_ptr<crypto::PublicKey> nodePublicKey;
    atomic<int> version = 1;
};

class HttpClient {

public:
    HttpClient(const std::string& rootUrl, int pollPeriodMillis);
    virtual ~HttpClient();

    void sendGetRequest(const std::string& path, const std::function<void(int,byte_vector&&)>& callback);
    void sendGetRequest(const std::string& path, std::function<void(int,byte_vector&&)>&& callback);

    void sendGetRequestUrl(const std::string& path, const std::function<void(int,byte_vector&&)>& callback);
    void sendGetRequestUrl(const std::string& path, std::function<void(int,byte_vector&&)>&& callback);

    void sendBinRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback);
    void sendBinRequest(const std::string& url, const std::string& method, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);

    void sendRawRequestUrl(const std::string& url, const std::string& method, const std::string& extHeaders, const byte_vector& reqBody, const std::function<void(int,byte_vector&&)>& callback);
    void sendRawRequestUrl(const std::string& url, const std::string& method, const std::string& extHeaders, const byte_vector& reqBody, std::function<void(int,byte_vector&&)>&& callback);

    /**
     * Authenticate self to the remote party. Blocks until the handshake is done. It is important to start() connection
     * before any use.
     */
    void start(const crypto::PrivateKey& clientKey, const crypto::PublicKey& nodeKey);

    /**
     * Execute a command over the authenticated and encrypted connection. In the case of network errors, restarts the
     * command.
     */
    void command(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete);

    /**
     * Execute a command over the authenticated and encrypted connection. In the case of network errors, restarts the
     * command.
     */
    void command(const std::string& name, const UBinder& params, const std::function<void(UBinder&&)>& onComplete);

    /** for js bindings */
    void command(const byte_vector& callBin, std::function<void(byte_vector&&)>&& onComplete);

    /** for js bindings */
    void command(const byte_vector& callBin, const std::function<void(byte_vector&&)>& onComplete);

    void changeStartTimeoutMillis(int newValue) {startTimeoutMillis_ = newValue;}

private:
    void execCommand(const byte_vector& callBin, std::function<void(byte_vector&&)>&& onComplete);
    void execCommand(const std::string& name, const UBinder& params, std::function<void(UBinder&&)>&& onComplete);
    std::string makeFullUrl(const std::string& path);

private:
    HttpClientWorkerAsync worker_;
    std::shared_ptr<HttpClientSession> session_;
    std::string rootUrl_;
    int startTimeoutMillis_ = 10000;

public:
    static const int CLIENT_VERSION;
};

};

#endif //U8_HTTPCLIENT_H
